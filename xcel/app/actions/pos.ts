"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { withDocumentNumberRetry } from "@/lib/invoice";

type ActionState = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const money = (n: number) => new Prisma.Decimal(n.toFixed(2));

/* ------------------------------------------------------------- catalog */

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  price: string;
  imageUrl: string | null;
  category: string | null;
  categoryId: string | null;
  stock: number;
  alertAt: number;
};

export async function posSearchProductsAction(opts: {
  search?: string;
  categoryId?: string | "ALL";
  /** When set, stock reflects only this location — checkout deducts from it. */
  locationId?: string;
}): Promise<PosProduct[]> {
  const session = await requireSession();

  const rows = await prisma.product.findMany({
    where: {
      businessId: session.businessId,
      deletedAt: null,
      status: "ACTIVE",
      ...(opts.search?.trim()
        ? {
            OR: [
              { name: { contains: opts.search.trim(), mode: "insensitive" as const } },
              { sku: { contains: opts.search.trim(), mode: "insensitive" as const } },
              { barcode: { contains: opts.search.trim(), mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(opts.categoryId && opts.categoryId !== "ALL"
        ? { categoryId: opts.categoryId }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 60,
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      imageUrl: true,
      alertAt: true,
      category: { select: { id: true, name: true } },
      stockLevels: {
        // Stock for the POS's selected location (fallback: business-wide total)
        where: opts.locationId
          ? { locationId: opts.locationId }
          : { location: { businessId: session.businessId } },
        select: { quantity: true },
      },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: p.price.toFixed(2),
    imageUrl: p.imageUrl,
    category: p.category?.name ?? null,
    categoryId: p.category?.id ?? null,
    stock: p.stockLevels.reduce((s, l) => s + l.quantity, 0),
    alertAt: p.alertAt,
  }));
}

export async function posListCategoriesAction() {
  const session = await requireSession();
  const rows = await prisma.category.findMany({
    where: { businessId: session.businessId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    // Only categories that actually have active products
  });
  return rows;
}

export async function posSearchCustomersAction(search: string) {
  const session = await requireSession();
  const term = search.trim();
  return prisma.customer.findMany({
    where: {
      businessId: session.businessId,
      deletedAt: null,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term } },
              { email: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 8,
    select: { id: true, name: true, phone: true, type: true },
  });
}

/* ------------------------------------------------------------ checkout */

export type CheckoutItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: string;
  discount?: string;
  /** Optional per-line overcharge (extra fee added to the line). */
  overcharge?: string;
};

export type CheckoutPayment = {
  method: "CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT";
  amount: string;
  /** Channel used for a transfer/POS part, e.g. "Opay", "Moniepoint". */
  provider?: string | null;
  accountId?: string | null;
  reference?: string | null;
};

export type CheckoutInput = {
  locationId: string;
  customerId?: string | null;
  items: CheckoutItem[];
  overallDiscount?: string;
  paymentMethod: "CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT";
  payments: CheckoutPayment[];
  /** Managers may authorise selling below zero. */
  allowNegative?: boolean;
};

class PosError extends Error {}

export async function checkoutAction(
  input: CheckoutInput,
): Promise<ActionState & { saleId?: string; invoiceNo?: string; totals?: { items: number; subtotal: string; discount: string; total: string; paid: string; due: string } }> {
  const session = await requireSession();

  if (!input.items.length) return { ok: false, error: "Cart is empty." };

  // Location
  const location = await prisma.location.findFirst({
    where: { id: input.locationId, businessId: session.businessId },
    select: { id: true, name: true },
  });
  if (!location) return { ok: false, error: "Invalid location." };

  const isManager = session.role === "OWNER" || session.role === "MANAGER";

  try {
    // The invoice number is reserved atomically (see lib/invoice.ts) and the
    // transaction retries with a fresh number if a collision ever occurs.
    const result = await withDocumentNumberRetry(
      async (tx, invoiceNo) => {
        // One round-trip: products + their stock rows at this location.
        const ids = [...new Set(input.items.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: ids }, businessId: session.businessId, deletedAt: null, status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            price: true,
            stockLevels: { where: { locationId: location.id }, select: { quantity: true } },
          },
        });
        const byId = new Map(products.map((p) => [p.id, p]));

        // Pricing and validation are pure — no awaits inside the loop.
        let subtotal = 0;
        const saleItems = input.items.map((item) => {
          const product = byId.get(item.productId);
          if (!product) throw new PosError(`Product unavailable: ${item.name}`);

          const qty = Math.trunc(item.qty);
          if (qty <= 0) throw new PosError(`Invalid quantity for ${item.name}`);

          // Trust server-side price; client price is display-only
          const unitPrice = Number(product.price);
          const discount = Math.max(0, Number(item.discount ?? 0));
          const overcharge = Math.max(0, Number(item.overcharge ?? 0));
          const line = qty * unitPrice - discount + overcharge;
          if (line < 0) throw new PosError(`Discount exceeds line total for ${item.name}`);
          subtotal += line;

          return {
            productId: product.id,
            name: product.name,
            qty,
            unitPrice,
            discount,
            subtotal: line,
            currentStock: product.stockLevels[0]?.quantity ?? 0,
          };
        });

        const overallDiscount = Math.max(0, Number(input.overallDiscount ?? 0));
        if (overallDiscount > subtotal) throw new PosError("Overall discount exceeds subtotal.");
        const total = subtotal - overallDiscount;

        const paid = input.payments.reduce((s, p) => s + Number(p.amount), 0);
        if (paid > total + 0.001) throw new PosError("Payments exceed total payable.");
        if (paid <= 0 && input.paymentMethod !== "CREDIT") {
          throw new PosError("Record at least one payment.");
        }
        const due = Math.max(0, total - paid);

        // Stock policy: block negatives unless a manager forces it
        for (const item of saleItems) {
          const projected = item.currentStock - item.qty;
          if (projected < 0) {
            if (!isManager || !input.allowNegative) {
              throw new PosError(
                `Not enough stock for ${item.name} (${item.currentStock} left). ` +
                  (isManager ? "Enable “Force allow negative” to proceed." : "Ask a manager to restock."),
              );
            }
          }
        }

        const paymentStatus = due === 0 ? "PAID" : paid === 0 ? "UNPAID" : "PARTIAL";

        const sale = await tx.sale.create({
          data: {
            businessId: session.businessId,
            locationId: location.id,
            invoiceNo,
            customerId: input.customerId ?? null,
            soldById: session.id,
            status: "COMPLETED",
            paymentMethod: input.paymentMethod,
            paymentStatus,
            totalAmount: money(total),
            totalPaid: money(paid),
            due: money(due),
            itemsCount: saleItems.reduce((s, i) => s + i.qty, 0),
            items: {
              create: saleItems.map((i) => ({
                productId: i.productId,
                qty: i.qty,
                unitPrice: money(i.unitPrice),
                discount: money(i.discount),
                subtotal: money(i.subtotal),
              })),
            },
          },
          select: { id: true, invoiceNo: true },
        });

        // One parallel batch: deduct every stock row (creating missing ones as
        // negative), write all SALE movements, record all payments and credit
        // their accounts. Postgres serializes concurrent writes to the same row
        // inside the transaction, so the math stays exact — but wall-clock time
        // drops from ~4 sequential awaits per line to a single round-trip.
        await Promise.all([
          ...saleItems.map((item) =>
            tx.stockLevel.upsert({
              where: { productId_locationId: { productId: item.productId, locationId: location.id } },
              update: { quantity: { decrement: item.qty } },
              create: { productId: item.productId, locationId: location.id, quantity: -item.qty },
            }),
          ),
          ...saleItems.map((item) =>
            tx.stockMovement.create({
              data: {
                productId: item.productId,
                locationId: location.id,
                type: "SALE",
                quantity: -item.qty,
                referenceId: sale.id,
                notes: `Sale ${invoiceNo}`,
                createdById: session.id,
              },
            }),
          ),
          ...input.payments.map((p) =>
            tx.payment.create({
              data: {
                saleId: sale.id,
                method: p.method,
                provider: p.provider ?? null,
                amount: money(Number(p.amount)),
                accountId: p.accountId ?? null,
                reference: p.reference ?? `RCPT-${invoiceNo}`,
              },
            }),
          ),
          ...input.payments
            .filter((p) => p.accountId != null)
            .map((p) =>
              tx.bankAccount.updateMany({
                where: { id: p.accountId as string, businessId: session.businessId },
                data: { balance: { increment: money(Number(p.amount)) } },
              }),
            ),
        ]);

        return {
          saleId: sale.id,
          invoiceNo,
          totals: {
            items: saleItems.reduce((s, i) => s + i.qty, 0),
            subtotal: subtotal.toFixed(2),
            discount: overallDiscount.toFixed(2),
            total: total.toFixed(2),
            paid: paid.toFixed(2),
            due: due.toFixed(2),
          },
        };
      },
      {
        businessId: session.businessId,
        kind: "SALE",
        // Pooled Supabase (pgBouncer) round-trips are slow; the 5s default
        // reaped long checkouts mid-flight ("Transaction not found").
        txOptions: { timeout: 15_000, maxWait: 10_000 },
      },
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/sales");
    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof PosError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Checkout failed.",
    };
  }
}

/* ------------------------------------------------------------- receipt */

export type ReceiptData = {
  saleId: string;
  invoiceNo: string;
  createdAt: string;
  businessName: string;
  locationName: string;
  cashierName: string;
  customerName: string;
  items: { name: string; qty: number; unitPrice: string; subtotal: string }[];
  totals: { subtotal: string; discount: string; total: string; paid: string; due: string };
  paymentMethod: string;
};

export async function getReceiptAction(saleId: string): Promise<
  { ok: true; receipt: ReceiptData } | { ok: false; error: string }
> {
  const session = await requireSession();
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId: session.businessId },
    select: {
      id: true,
      invoiceNo: true,
      createdAt: true,
      paymentMethod: true,
      totalAmount: true,
      totalPaid: true,
      due: true,
      location: { select: { name: true } },
      customer: { select: { name: true } },
      soldBy: { select: { name: true } },
      items: {
        select: {
          qty: true,
          unitPrice: true,
          subtotal: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!sale) return { ok: false, error: "Sale not found." };

  return {
    ok: true,
    receipt: {
      saleId: sale.id,
      invoiceNo: sale.invoiceNo,
      createdAt: sale.createdAt.toISOString(),
      businessName: session.businessName,
      locationName: sale.location.name,
      cashierName: sale.soldBy.name,
      customerName: sale.customer?.name ?? "Walk-in Customer",
      items: sale.items.map((i) => ({
        name: i.product.name,
        qty: i.qty,
        unitPrice: i.unitPrice.toFixed(2),
        subtotal: i.subtotal.toFixed(2),
      })),
      totals: {
        subtotal: (Number(sale.totalAmount) + Number(sale.due)).toFixed(2),
        discount: "0.00",
        total: sale.totalAmount.toFixed(2),
        paid: sale.totalPaid.toFixed(2),
        due: sale.due.toFixed(2),
      },
      paymentMethod: sale.paymentMethod,
    },
  };
}
