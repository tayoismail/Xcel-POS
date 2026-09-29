"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/invoice";

type ActionState =
  | { ok: true; referenceNo?: string; received?: boolean; supplierId?: string }
  | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const money = (n: number) => new Prisma.Decimal(n.toFixed(2));

const isManagerRole = (role: string) => role === "OWNER" || role === "MANAGER";

/** Manager-only read guard — blocks staff calling these actions directly. */
async function requireManagerSession() {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    throw new Error("Forbidden: manager access required.");
  }
  return session;
}

export type SupplierOption = {
  id: string;
  name: string;
  phone: string | null;
};

export type PurchaseProductOption = {
  id: string;
  name: string;
  sku: string;
  costPrice: string;
  price: string;
};

export type PurchaseStatusFilter = "ALL" | "PENDING" | "RECEIVED";
export type PurchasePaymentFilter = "ALL" | "PAID" | "PARTIAL" | "UNPAID";

export type PurchaseRow = {
  id: string;
  referenceNo: string;
  date: string;
  locationName: string;
  supplierName: string | null;
  status: "PENDING" | "RECEIVED";
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  grandTotal: string;
  paymentDue: string;
  addedByName: string;
  notes: string | null;
};

export type PurchaseCounts = {
  all: number;
  pending: number;
  received: number;
};

export type PurchaseListResult = {
  rows: PurchaseRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: PurchaseCounts;
};

/* ----------------------------------------------------------- lookups */

export async function listSuppliersAction(): Promise<SupplierOption[]> {
  const session = await requireManagerSession();
  return prisma.supplier.findMany({
    where: { businessId: session.businessId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
}

export async function createSupplierAction(input: {
  name: string;
  phone?: string;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can add suppliers." };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Supplier name is required." };

  try {
    const supplier = await prisma.supplier.create({
      data: {
        businessId: session.businessId,
        name,
        phone: input.phone?.trim() || null,
      },
      select: { id: true },
    });
    revalidatePath("/dashboard/purchases");
    return { ok: true, supplierId: supplier.id };
  } catch {
    return { ok: false, error: "Could not create supplier. Please try again." };
  }
}

/** Lightweight product picker for the purchase form (active products only). */
export async function searchPurchaseProductsAction(
  search: string,
): Promise<PurchaseProductOption[]> {
  const session = await requireManagerSession();
  const term = search.trim();

  const rows = await prisma.product.findMany({
    where: {
      businessId: session.businessId,
      deletedAt: null,
      status: "ACTIVE",
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { sku: { contains: term, mode: "insensitive" as const } },
              { barcode: { contains: term } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 25,
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true,
      price: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    costPrice: r.costPrice.toString(),
    price: r.price.toString(),
  }));
}

/* --------------------------------------------------------------- list */

export async function listPurchasesAction(opts: {
  search?: string;
  status?: PurchaseStatusFilter;
  paymentStatus?: PurchasePaymentFilter;
  locationId?: string;
  page?: number;
  pageSize?: number;
}): Promise<PurchaseListResult> {
  const session = await requireManagerSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const baseWhere: Prisma.PurchaseWhereInput = {
    businessId: session.businessId,
    ...(opts.locationId && opts.locationId !== "ALL"
      ? { locationId: opts.locationId }
      : {}),
    ...(opts.paymentStatus && opts.paymentStatus !== "ALL"
      ? { paymentStatus: opts.paymentStatus }
      : {}),
    ...(term
      ? {
          OR: [
            { referenceNo: { contains: term, mode: "insensitive" as const } },
            { supplier: { name: { contains: term, mode: "insensitive" as const } } },
            { addedBy: { name: { contains: term, mode: "insensitive" as const } } },
            { items: { some: { product: { name: { contains: term, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const where: Prisma.PurchaseWhereInput = {
    ...baseWhere,
    ...(opts.status && opts.status !== "ALL" ? { status: opts.status } : {}),
  };

  const [rows, total, allCount, grouped] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        referenceNo: true,
        date: true,
        status: true,
        paymentStatus: true,
        grandTotal: true,
        notes: true,
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        addedBy: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
    prisma.purchase.count({ where }),
    prisma.purchase.count({ where: baseWhere }),
    prisma.purchase.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: PurchaseCounts = { all: allCount, pending: 0, received: 0 };
  for (const g of grouped) {
    if (g.status === "PENDING") counts.pending = g._count._all;
    else if (g.status === "RECEIVED") counts.received = g._count._all;
  }

  return {
    rows: rows.map((r) => {
      const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
      const grand = Number(r.grandTotal);
      return {
        id: r.id,
        referenceNo: r.referenceNo,
        date: r.date.toISOString(),
        locationName: r.location.name,
        supplierName: r.supplier?.name ?? null,
        status: r.status,
        paymentStatus: r.paymentStatus,
        grandTotal: r.grandTotal.toString(),
        paymentDue: Math.max(0, grand - paid).toFixed(2),
        addedByName: r.addedBy.name,
        notes: r.notes,
      };
    }),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

/* ------------------------------------------------------------- create */

/** Increment StockLevel and log PURCHASE movements inside a transaction. */
async function applyReceipt(
  tx: Prisma.TransactionClient,
  purchase: { id: string; referenceNo: string; locationId: string },
  items: { productId: string; qty: number }[],
  createdById: string,
) {
  for (const item of items) {
    await tx.stockLevel.upsert({
      where: {
        productId_locationId: {
          productId: item.productId,
          locationId: purchase.locationId,
        },
      },
      update: { quantity: { increment: item.qty } },
      create: {
        productId: item.productId,
        locationId: purchase.locationId,
        quantity: item.qty,
      },
    });
    await tx.stockMovement.create({
      data: {
        productId: item.productId,
        locationId: purchase.locationId,
        type: "PURCHASE",
        quantity: item.qty,
        referenceId: purchase.id,
        notes: `Purchase ${purchase.referenceNo}`,
        createdById,
      },
    });
  }
}

// Delegates to the atomic per-business counter (lib/invoice.ts); the old
// read-the-last-100-rows approach collided under concurrent creates.
async function nextPurchaseReference(tx: Prisma.TransactionClient, businessId: string) {
  return nextDocumentNumber(businessId, "PURCHASE", tx);
}

export async function createPurchaseAction(input: {
  supplierId?: string | null;
  locationId: string;
  items: { productId: string; qty: number; unitCost: number }[];
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  paymentMethod?: "CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT";
  amountPaid?: number;
  notes?: string;
  receiveNow?: boolean;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can create purchases." };
  }

  if (!input.items?.length) {
    return { ok: false, error: "Add at least one item to the purchase." };
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.qty) || item.qty < 1) {
      return { ok: false, error: "Item quantities must be whole numbers of 1 or more." };
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      return { ok: false, error: "Item costs cannot be negative." };
    }
  }

  const grandTotal = input.items.reduce(
    (s, i) => s + i.qty * i.unitCost,
    0,
  );

  let paid = 0;
  if (input.paymentStatus === "PAID") {
    paid = grandTotal;
  } else if (input.paymentStatus === "PARTIAL") {
    paid = input.amountPaid ?? 0;
    if (paid <= 0) {
      return { ok: false, error: "Enter the amount already paid for a partial payment." };
    }
    if (paid >= grandTotal) {
      return { ok: false, error: "Amount paid must be less than the grand total (or mark it Paid)." };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: input.locationId, businessId: session.businessId },
        select: { id: true },
      });
      if (!location) throw new Error("Invalid location.");

      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          businessId: session.businessId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new Error("One or more products are invalid.");
      }

      if (input.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: {
            id: input.supplierId,
            businessId: session.businessId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!supplier) throw new Error("Invalid supplier.");
      }

      const referenceNo = await nextPurchaseReference(tx, session.businessId);

      const purchase = await tx.purchase.create({
        data: {
          businessId: session.businessId,
          locationId: location.id,
          referenceNo,
          supplierId: input.supplierId || null,
          status: input.receiveNow ? "RECEIVED" : "PENDING",
          paymentStatus: input.paymentStatus,
          grandTotal: money(grandTotal),
          notes: input.notes?.trim() || null,
          addedById: session.id,
          items: {
            create: input.items.map((i) => ({
              productId: i.productId,
              qty: i.qty,
              unitCost: money(i.unitCost),
              subtotal: money(i.qty * i.unitCost),
            })),
          },
        },
        select: { id: true, referenceNo: true, locationId: true },
      });

      if (paid > 0) {
        await tx.payment.create({
          data: {
            purchaseId: purchase.id,
            method: input.paymentMethod ?? "CASH",
            amount: money(paid),
            reference: `RCPT-${referenceNo}`,
          },
        });
      }

      if (input.receiveNow) {
        await applyReceipt(
          tx,
          purchase,
          input.items.map((i) => ({ productId: i.productId, qty: i.qty })),
          session.id,
        );
      }

      return { referenceNo, received: !!input.receiveNow };
    });

    revalidatePath("/dashboard/purchases");
    return { ok: true, ...result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not create purchase.";
    return { ok: false, error: msg === "Invalid location." || msg.startsWith("One or more") || msg === "Invalid supplier." ? msg : "Could not create purchase. Please try again." };
  }
}

/* ------------------------------------------------------------- receive */

export async function receivePurchaseAction(
  purchaseId: string,
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can receive purchases." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, businessId: session.businessId },
        select: {
          id: true,
          referenceNo: true,
          locationId: true,
          status: true,
          items: { select: { productId: true, qty: true } },
        },
      });
      if (!purchase) throw new Error("Purchase not found.");
      if (purchase.status === "RECEIVED") {
        throw new Error("This purchase has already been received.");
      }
      if (!purchase.items.length) {
        throw new Error("This purchase has no items to receive.");
      }

      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: "RECEIVED" },
      });
      await applyReceipt(tx, purchase, purchase.items, session.id);

      return { referenceNo: purchase.referenceNo };
    });

    revalidatePath("/dashboard/purchases");
    return { ok: true, referenceNo: result.referenceNo, received: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not receive purchase.";
    if (
      msg === "Purchase not found." ||
      msg === "This purchase has already been received." ||
      msg === "This purchase has no items to receive."
    ) {
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Could not receive purchase. Please try again." };
  }
}
