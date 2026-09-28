"use server";

import { revalidatePath } from "next/cache";
import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";

type ActionState = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export type StockLevelRow = {
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  imageUrl: string | null;
  alertAt: number;
  productStatus: "ACTIVE" | "INACTIVE";
  locationId: string;
  locationName: string;
  quantity: number;
};

export type StockLevelResult = {
  rows: StockLevelRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  lowStockCount: number;
};

export type MovementRow = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  locationName: string;
  type: StockMovementType;
  quantity: number;
  referenceId: string | null;
  notes: string | null;
  createdByName: string;
  createdAt: string;
};

export type MovementResult = {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type StockStatusFilter = "ALL" | "LOW" | "OUT" | "NEGATIVE";

/* ------------------------------------------------------------- helpers */

/**
 * Location rows for the business (used by the adjust dialog and POS).
 * Cheap query, safe to call repeatedly.
 */
export async function listLocationsAction() {
  const session = await requireSession();
  return prisma.location.findMany({
    where: { businessId: session.businessId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/* --------------------------------------------------------------- levels */

export async function listStockLevelsAction(opts: {
  search?: string;
  status?: StockStatusFilter;
  page?: number;
  pageSize?: number;
}): Promise<StockLevelResult> {
  const session = await requireSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

  // Base filters shared by the page query and the low-stock counter.
  const baseWhere: Prisma.StockLevelWhereInput = {
    location: { businessId: session.businessId },
    product: {
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
    },
  };

  // Status filtering is applied per-row after the query (Prisma can't
  // compare the quantity column against the product's alertAt column).

  const [rows, total, lowStockRows] = await Promise.all([
    prisma.stockLevel.findMany({
      where: baseWhere,
      orderBy: [{ product: { name: "asc" } }, { location: { name: "asc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        productId: true,
        locationId: true,
        quantity: true,
        product: {
          select: {
            name: true,
            sku: true,
            barcode: true,
            imageUrl: true,
            alertAt: true,
            status: true,
          },
        },
        location: { select: { name: true } },
      },
    }),
    prisma.stockLevel.count({ where: baseWhere }),
    prisma.stockLevel.findMany({
      where: {
        location: { businessId: session.businessId },
        product: { deletedAt: null },
      },
      select: { quantity: true, product: { select: { alertAt: true } } },
    }),
  ]);

  const lowStockCount = lowStockRows.filter(
    (r) => r.quantity > 0 && r.quantity <= r.product.alertAt,
  ).length;

  // Status filter is computed per-row (Prisma can't compare two columns directly)
  let filtered = rows;
  if (status === "LOW") {
    filtered = rows.filter(
      (r) => r.quantity > 0 && r.quantity <= r.product.alertAt,
    );
  } else if (status === "OUT") {
    filtered = rows.filter((r) => r.quantity === 0);
  } else if (status === "NEGATIVE") {
    filtered = rows.filter((r) => r.quantity < 0);
  }

  return {
    rows: filtered.map((r) => ({
      productId: r.productId,
      name: r.product.name,
      sku: r.product.sku,
      barcode: r.product.barcode,
      imageUrl: r.product.imageUrl,
      alertAt: r.product.alertAt,
      productStatus: r.product.status as "ACTIVE" | "INACTIVE",
      locationId: r.locationId,
      locationName: r.location.name,
      quantity: r.quantity,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    lowStockCount,
  };
}

/* ------------------------------------------------------------ movements */

export async function listMovementsAction(opts: {
  search?: string;
  type?: StockMovementType | "ALL";
  locationId?: string | "ALL";
  page?: number;
  pageSize?: number;
}): Promise<MovementResult> {
  const session = await requireSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

  const where: Prisma.StockMovementWhereInput = {
    location: { businessId: session.businessId },
    ...(opts.type && opts.type !== "ALL" ? { type: opts.type } : {}),
    ...(opts.locationId && opts.locationId !== "ALL"
      ? { locationId: opts.locationId }
      : {}),
    ...(opts.search?.trim()
      ? {
          OR: [
            { product: { name: { contains: opts.search.trim(), mode: "insensitive" as const } } },
            { product: { sku: { contains: opts.search.trim(), mode: "insensitive" as const } } },
            { notes: { contains: opts.search.trim(), mode: "insensitive" as const } },
            { referenceId: opts.search.trim() },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        productId: true,
        type: true,
        quantity: true,
        referenceId: true,
        notes: true,
        createdAt: true,
        product: { select: { name: true, sku: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return {
    rows: rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      sku: m.product.sku,
      locationName: m.location.name,
      type: m.type,
      quantity: m.quantity,
      referenceId: m.referenceId,
      notes: m.notes,
      createdByName: m.createdBy.name,
      createdAt: m.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ----------------------------------------------------------- adjustment */

export type AdjustStockInput = {
  productId: string;
  locationId: string;
  quantity: number; // signed delta (+ restock / - remove)
  reason: "PURCHASE" | "ADJUSTMENT" | "RETURN" | "PRODUCTION" | "TRANSFER" | "SALE";
  notes?: string | null;
  /** Manager override to let a sale/adjustment push stock below zero. */
  allowNegative?: boolean;
};

export async function adjustStockAction(
  input: AdjustStockInput,
): Promise<ActionState & { newQuantity?: number }> {
  const session = await requireSession();
  // Stock adjustments are a managerial action (RBAC)
  if (session.role === "STAFF") {
    return { ok: false, error: "Only managers can adjust stock." };
  }
  const qty = Math.trunc(input.quantity);
  if (!Number.isFinite(qty) || qty === 0) {
    return { ok: false, error: "Quantity must be a non-zero whole number." };
  }
  if (input.reason === "SALE") {
    return { ok: false, error: "Use the POS to record sales." };
  }

  // Product must belong to this business
  const product = await prisma.product.findFirst({
    where: { id: input.productId, businessId: session.businessId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!product) return { ok: false, error: "Product not found." };

  // Location must belong to this business
  const location = await prisma.location.findFirst({
    where: { id: input.locationId, businessId: session.businessId },
    select: { id: true, name: true },
  });
  if (!location) return { ok: false, error: "Location not found." };

  try {
    const newQuantity = await prisma.$transaction(async (tx) => {
      // Lock the level row to avoid races between concurrent adjustments
      await tx.$queryRaw`
        SELECT id FROM "StockLevel"
        WHERE "productId" = ${input.productId} AND "locationId" = ${input.locationId}
        FOR UPDATE
      `;
      const level = await tx.stockLevel.findUnique({
        where: { productId_locationId: {
          productId: input.productId,
          locationId: input.locationId,
        } },
        select: { quantity: true },
      });
      const current = level?.quantity ?? 0;
      const projected = current + qty;

      // Negative-stock policy: block by default...
      if (projected < 0) {
        const isManager = session.role === "OWNER" || session.role === "MANAGER";
        if (!isManager || !input.allowNegative) {
          throw new NegativeStockError(current);
        }
      }

      await tx.stockLevel.upsert({
        where: { productId_locationId: {
          productId: input.productId,
          locationId: input.locationId,
        } },
        update: { quantity: { increment: qty } },
        create: { productId: input.productId, locationId: input.locationId, quantity: qty },
      });

      await tx.stockMovement.create({
        data: {
          productId: input.productId,
          locationId: input.locationId,
          type: input.reason,
          quantity: qty,
          notes:
            input.notes?.trim() ||
            (projected < 0
              ? "Negative stock forced by manager"
              : null),
          createdById: session.id,
        },
      });

      await audit({
        businessId: session.businessId,
        userId: session.id,
        action: "STOCK_ADJUST",
        entity: "StockLevel",
        entityId: input.productId,
        summary: `Adjusted stock for ${product.name}: ${qty > 0 ? "+" : ""}${qty} → ${projected} at ${location.name}`,
        meta: {
          productId: input.productId,
          productName: product.name,
          locationId: input.locationId,
          delta: qty,
          newQuantity: projected,
          reason: input.reason,
          notes: input.notes ?? null,
        },
        tx,
      });

      return projected;
    });

    revalidatePath("/dashboard/inventory");
    return { ok: true, newQuantity };
  } catch (e) {
    if (e instanceof NegativeStockError) {
      return {
        ok: false,
        error: `Would leave ${e.current} in stock. Enable “Force allow negative” to proceed.`,
      };
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Adjustment failed.",
    };
  }
}

class NegativeStockError extends Error {
  constructor(public current: number) {
    super("Negative stock not allowed");
  }
}
