"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";

type ActionState = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

/** Only OWNER/MANAGER may touch the catalog. */
async function requireCatalogAccess() {
  const session = await requireSession();
  if (!can(session.role, "products.manage")) {
    throw new Error("Forbidden: staff accounts cannot manage products.");
  }
  return session;
}

/** Decimal-safe number formatting for Prisma money columns. */
const money = (n: number) => new Prisma.Decimal(n.toFixed(2));

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  price: string;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  alertAt: number;
  category: string | null;
  stock: number;
};

export type ProductListResult = {
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ProductFormData = {
  name: string;
  sku: string;
  barcode?: string | null;
  categoryId?: string | null;
  brand?: string | null;
  price: string;
  costPrice?: string;
  alertAt?: number;
  status?: "ACTIVE" | "INACTIVE";
  description?: string | null;
};

/* ------------------------------------------------------------------ list */

export async function listProductsAction(opts: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ProductListResult> {
  const session = await requireSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

  const where: Prisma.ProductWhereInput = {
    businessId: session.businessId,
    deletedAt: null,
    ...(opts.search?.trim()
      ? {
          OR: [
            { name: { contains: opts.search.trim(), mode: "insensitive" as const } },
            { sku: { contains: opts.search.trim(), mode: "insensitive" as const } },
            { barcode: { contains: opts.search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        sku: true,
        barcode: true,
        brand: true,
        price: true,
        imageUrl: true,
        status: true,
        alertAt: true,
        category: { select: { name: true } },
        stockLevels: {
          where: { location: { businessId: session.businessId } },
          select: { quantity: true },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    rows: rows.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      brand: p.brand,
      price: p.price.toFixed(2),
      imageUrl: p.imageUrl,
      status: p.status as "ACTIVE" | "INACTIVE",
      alertAt: p.alertAt,
      category: p.category?.name ?? null,
      stock: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listCategoriesAction(): Promise<
  { id: string; name: string }[]
> {
  const session = await requireSession();
  return prisma.category.findMany({
    where: { businessId: session.businessId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/* ------------------------------------------------------------- mutations */

async function uploadProductImage(file: File, businessId: string) {
  const supabase = await createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function createProductAction(
  data: ProductFormData,
  imageFile?: File | null,
): Promise<ActionState & { id?: string }> {
  const session = await requireCatalogAccess();
  try {
    const imageUrl = imageFile
      ? await uploadProductImage(imageFile, session.businessId)
      : null;
    const product = await prisma.product.create({
      data: {
        businessId: session.businessId,
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        brand: data.brand || null,
        price: money(Number(data.price)),
        costPrice: money(Number(data.costPrice || 0)),
        alertAt: data.alertAt ?? 5,
        status: data.status ?? "ACTIVE",
        description: data.description || null,
        imageUrl,
      },
    });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "PRODUCT_CREATE",
      entity: "Product",
      entityId: product.id,
      summary: `Created product ${product.name} (${product.sku}) at ${formatCurrency(product.price)}`,
      meta: { sku: product.sku, price: String(product.price), costPrice: String(product.costPrice) },
    });
    revalidatePath("/dashboard/products");
    return { ok: true, id: product.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "SKU or barcode already exists in your business." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}

export async function updateProductAction(
  id: string,
  data: ProductFormData,
  imageFile?: File | null,
): Promise<ActionState> {
  const session = await requireCatalogAccess();
  try {
    const existing = await prisma.product.findFirst({
      where: { id, businessId: session.businessId, deletedAt: null },
      select: { id: true, name: true, price: true, costPrice: true },
    });
    if (!existing) return { ok: false, error: "Product not found." };

    const imageUrl = imageFile
      ? await uploadProductImage(imageFile, session.businessId)
      : undefined;
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        sku: data.sku,
        barcode: data.barcode || null,
        categoryId: data.categoryId || null,
        brand: data.brand || null,
        price: money(Number(data.price)),
        costPrice: money(Number(data.costPrice || 0)),
        alertAt: data.alertAt ?? 5,
        status: data.status ?? "ACTIVE",
        description: data.description || null,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
    });

    const priceChanged = Number(updated.price) !== Number(existing.price);
    const costChanged = Number(updated.costPrice) !== Number(existing.costPrice);
    if (priceChanged || costChanged) {
      await audit({
        businessId: session.businessId,
        userId: session.id,
        action: "PRICE_CHANGE",
        entity: "Product",
        entityId: updated.id,
        summary: `Price change for ${updated.name}: ${formatCurrency(existing.price)} → ${formatCurrency(updated.price)}${costChanged ? ` · cost ${formatCurrency(existing.costPrice)} → ${formatCurrency(updated.costPrice)}` : ""}`,
        meta: {
          sku: updated.sku,
          oldPrice: String(existing.price),
          newPrice: String(updated.price),
          oldCostPrice: String(existing.costPrice),
          newCostPrice: String(updated.costPrice),
        },
      });
    }

    revalidatePath("/dashboard/products");
    return { ok: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "SKU or barcode already exists in your business." };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Something went wrong.",
    };
  }
}

export async function setProductStatusAction(
  ids: string[],
  status: "ACTIVE" | "INACTIVE",
): Promise<ActionState> {
  const session = await requireCatalogAccess();
  await prisma.product.updateMany({
    where: { id: { in: ids }, businessId: session.businessId },
    data: { status },
  });
  revalidatePath("/dashboard/products");
  return { ok: true };
}

export async function deleteProductsAction(ids: string[]): Promise<ActionState> {
  const session = await requireCatalogAccess();
  // Soft delete — sale/purchase history keeps its product references intact.
  const removed = await prisma.product.findMany({
    where: { id: { in: ids }, businessId: session.businessId },
    select: { id: true, name: true, sku: true },
  });
  await prisma.product.updateMany({
    where: { id: { in: ids }, businessId: session.businessId },
    data: { deletedAt: new Date(), status: "INACTIVE" },
  });
  await audit({
    businessId: session.businessId,
    userId: session.id,
    action: "PRODUCT_DELETE",
    entity: "Product",
    entityId: ids.join(","),
    summary: `Deleted ${removed.length} product${removed.length === 1 ? "" : "s"}: ${removed.map((p) => p.name).join(", ")}`,
    meta: { products: removed.map((p) => ({ id: p.id, sku: p.sku })) },
  });
  revalidatePath("/dashboard/products");
  return { ok: true };
}
