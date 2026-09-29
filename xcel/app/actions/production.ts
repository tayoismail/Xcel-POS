"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

type ActionState = { ok: true; id?: string } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const isManagerRole = (role: string) => role === "OWNER" || role === "MANAGER";

/** Manager-only read guard — blocks staff calling these actions directly. */
async function requireManagerSession() {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    throw new Error("Forbidden: manager access required.");
  }
  return session;
}

export type ProductionLogRow = {
  id: string;
  createdAt: string;
  productName: string;
  sku: string;
  quantity: number;
  locationName: string | null;
  notes: string | null;
  createdByName: string;
};

export type ProductionListResult = {
  rows: ProductionLogRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listProductionLogsAction(opts: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<ProductionListResult> {
  const session = await requireManagerSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const where: Prisma.ProductionLogWhereInput = {
    businessId: session.businessId,
    ...(term
      ? {
          OR: [
            { product: { name: { contains: term, mode: "insensitive" as const } } },
            { product: { sku: { contains: term, mode: "insensitive" as const } } },
            { notes: { contains: term, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.productionLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        createdAt: true,
        quantity: true,
        notes: true,
        product: { select: { name: true, sku: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.productionLog.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      productName: r.product.name,
      sku: r.product.sku,
      quantity: r.quantity,
      locationName: r.location?.name ?? null,
      notes: r.notes,
      createdByName: r.createdBy.name,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Log an assembly run: increases finished-good stock at the location,
 * records a PRODUCTION movement, and stores the log.
 * Component (BOM) deduction can be layered on later.
 */
export async function logProductionAction(input: {
  productId: string;
  locationId: string;
  quantity: number;
  notes?: string;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can log production." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, error: "Quantity must be a whole number of 1 or more." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          businessId: session.businessId,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (!product) throw new Error("Product not found.");

      const location = await tx.location.findFirst({
        where: { id: input.locationId, businessId: session.businessId },
        select: { id: true },
      });
      if (!location) throw new Error("Location not found.");

      const log = await tx.productionLog.create({
        data: {
          businessId: session.businessId,
          productId: product.id,
          locationId: location.id,
          quantity: input.quantity,
          notes: input.notes?.trim() || null,
          createdById: session.id,
        },
        select: { id: true },
      });

      await tx.stockLevel.upsert({
        where: {
          productId_locationId: {
            productId: product.id,
            locationId: location.id,
          },
        },
        update: { quantity: { increment: input.quantity } },
        create: {
          productId: product.id,
          locationId: location.id,
          quantity: input.quantity,
        },
      });

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          locationId: location.id,
          type: "PRODUCTION",
          quantity: input.quantity,
          referenceId: log.id,
          notes: `Production +${input.quantity} ${product.name}`,
          createdById: session.id,
        },
      });

      return { id: log.id };
    });

    revalidatePath("/dashboard/production");
    revalidatePath("/dashboard/inventory");
    return { ok: true, id: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Product not found." || msg === "Location not found.") {
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Could not log production. Please try again." };
  }
}
