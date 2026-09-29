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

/** Server-side money/alert validation shared by create + update. */
function validateProductMoney(data: ProductFormData): string | null {
  const price = Number(data.price);
  if (!Number.isFinite(price) || price < 0) return "Price must be zero or more.";
  const cost = data.costPrice ? Number(data.costPrice) : 0;
  if (!Number.isFinite(cost) || cost < 0) return "Cost price must be zero or more.";
  if (data.alertAt !== undefined && (!Number.isInteger(data.alertAt) || data.alertAt < 0)) {
    return "Alert level must be a whole number of zero or more.";
  }
  return null;
}

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  price: string;
  costPrice: string;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  alertAt: number;
  categoryId: string | null;
  category: string | null;
  description: string | null;
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
        costPrice: true,
        imageUrl: true,
        status: true,
        alertAt: true,
        description: true,
        category: { select: { id: true, name: true } },
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
      costPrice: p.costPrice.toFixed(2),
      imageUrl: p.imageUrl,
      status: p.status as "ACTIVE" | "INACTIVE",
      alertAt: p.alertAt,
      categoryId: p.category?.id ?? null,
      category: p.category?.name ?? null,
      description: p.description,
      stock: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function listCategoriesAction(): Promise<
  { id: string; name: string; productCount: number }[]
> {
  const session = await requireSession();
  const rows = await prisma.category.findMany({
    where: { businessId: session.businessId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, productCount: c._count.products }));
}

export async function createCategoryAction(
  input: { name: string },
): Promise<ActionState & { id?: string }> {
  const session = await requireCatalogAccess();
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Category name is required." };
  if (name.length > 60) return { ok: false, error: "Keep the category name under 60 characters." };

  try {
    const dupe = await prisma.category.findFirst({
      where: { businessId: session.businessId, name: { equals: name, mode: "insensitive" as const } },
      select: { id: true },
    });
    if (dupe) return { ok: false, error: "A category with this name already exists." };
    const category = await prisma.category.create({
      data: { businessId: session.businessId, name },
      select: { id: true },
    });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "CATEGORY_CREATE",
      entity: "Category",
      entityId: category.id,
      summary: `Created category ${name}`,
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/settings");
    return { ok: true, id: category.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A category with this name already exists." };
    }
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionState> {
  const session = await requireCatalogAccess();
  try {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, businessId: session.businessId },
      select: { id: true, name: true },
    });
    if (!category) return { ok: false, error: "Category not found." };

    // Detach products first so their history/references stay intact.
    await prisma.$transaction([
      prisma.product.updateMany({
        where: { categoryId: category.id, businessId: session.businessId },
        data: { categoryId: null },
      }),
      prisma.category.delete({ where: { id: category.id } }),
    ]);

    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "CATEGORY_DELETE",
      entity: "Category",
      entityId: category.id,
      summary: `Deleted category ${category.name} (products uncategorized)`,
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete category." };
  }
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
  const invalid = validateProductMoney(data);
  if (invalid) return { ok: false, error: invalid };
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
  const invalid = validateProductMoney(data);
  if (invalid) return { ok: false, error: invalid };
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
  try {
    await prisma.product.updateMany({
      where: { id: { in: ids }, businessId: session.businessId },
      data: { status },
    });
    revalidatePath("/dashboard/products");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update status." };
  }
}

export async function deleteProductsAction(ids: string[]): Promise<ActionState> {
  const session = await requireCatalogAccess();
  try {
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
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete products." };
  }
}

/* ---------------------------------------------------------------- import */

export type ImportProductRow = {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  price: string;
  costPrice?: string;
  stock?: string;
  alertAt?: string;
  status?: string;
};

export type ImportProductsResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const IMPORT_MAX_ROWS = 500;

/**
 * Mass-create products from parsed CSV rows.
 * Categories are auto-created when missing; blank SKUs are auto-generated;
 * duplicate SKU/barcode rows are skipped (not failed) so one bad row never
 * blocks the rest of the upload.
 */
export async function importProductsAction(
  rows: ImportProductRow[],
): Promise<ActionState & { result?: ImportProductsResult }> {
  const session = await requireCatalogAccess();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: `Import up to ${IMPORT_MAX_ROWS} products at a time.` };
  }

  // Declared outside the try so a late failure still reports what was created.
  const result: ImportProductsResult = { created: 0, skipped: 0, errors: [] };
  try {
    const location = await prisma.location.findFirst({
      where: { businessId: session.businessId },
      orderBy: { name: "asc" },
      select: { id: true },
    });

    const categories = new Map(
      (
        await prisma.category.findMany({
          where: { businessId: session.businessId },
          select: { id: true, name: true },
        })
      ).map((c) => [c.name.toLowerCase(), c.id]),
    );

    const baseSku = `SKU-${Date.now().toString(36).toUpperCase()}`;

    const resolveCategoryId = async (raw?: string): Promise<string | null> => {
      const name = raw?.trim();
      if (!name) return null;
      const key = name.toLowerCase();
      const existing = categories.get(key);
      if (existing) return existing;
      try {
        const created = await prisma.category.create({
          data: { businessId: session.businessId, name },
          select: { id: true },
        });
        categories.set(key, created.id);
        return created.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const found = await prisma.category.findFirst({
            where: { businessId: session.businessId, name: { equals: name, mode: "insensitive" as const } },
            select: { id: true },
          });
          if (found) {
            categories.set(key, found.id);
            return found.id;
          }
        }
        throw e;
      }
    };

    for (const [i, row] of rows.entries()) {
      const rowNo = i + 1;
      const name = row.name?.trim();
      const price = Number(row.price);
      if (!name) {
        result.errors.push({ row: rowNo, message: "Missing product name" });
        continue;
      }
      if (!Number.isFinite(price) || price < 0) {
        result.errors.push({ row: rowNo, message: `Invalid price "${row.price ?? ""}"` });
        continue;
      }

      const sku = row.sku?.trim() || `${baseSku}-${rowNo}`;
      const barcode = row.barcode?.trim() || null;
      const costPrice = Number(row.costPrice);
      const stock = Math.max(0, Math.trunc(Number(row.stock) || 0));
      const alertAt = Number.isFinite(Number(row.alertAt))
        ? Math.max(0, Math.trunc(Number(row.alertAt)))
        : 5;
      const status = row.status?.trim().toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

      // Row-scoped failures never abort the batch — a single bad row used to
      // discard the counts (and audit) for everything already created.
      try {
        const categoryId = await resolveCategoryId(row.category);
        const product = await prisma.product.create({
          data: {
            businessId: session.businessId,
            name,
            sku,
            barcode,
            categoryId,
            brand: row.brand?.trim() || null,
            price: money(price),
            costPrice: money(Number.isFinite(costPrice) ? costPrice : 0),
            alertAt,
            status,
          },
        });

        if (stock > 0 && location) {
          await prisma.stockLevel.create({
            data: { productId: product.id, locationId: location.id, quantity: stock },
          });
          await prisma.stockMovement.create({
            data: {
              productId: product.id,
              locationId: location.id,
              type: "ADJUSTMENT",
              quantity: stock,
              notes: "Opening stock (CSV import)",
              createdById: session.id,
            },
          });
        }
        result.created++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          result.skipped++;
          result.errors.push({ row: rowNo, message: "Duplicate SKU or barcode — skipped" });
          continue;
        }
        result.errors.push({
          row: rowNo,
          message: e instanceof Error ? e.message : "Couldn't create this product",
        });
        continue;
      }
    }

    if (result.created === 0) {
      return {
        ok: false,
        error:
          result.errors.length > 0
            ? "No products were created — check the highlighted rows."
            : "No products could be created.",
        result,
      };
    }

    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "PRODUCT_IMPORT",
      entity: "Product",
      summary: `Imported ${result.created} product${result.created === 1 ? "" : "s"} from CSV (${result.skipped} skipped)`,
      meta: { created: result.created, skipped: result.skipped },
    });
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/settings");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Import failed. Please try again.",
      ...(result.created > 0 ? { result } : {}),
    };
  }
}
