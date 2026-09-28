"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { nextDocumentNumber, withDocumentNumberRetry } from "@/lib/invoice";

type ActionState =
  | { ok: true; id?: string; number?: string; invoiceNo?: string; invoiceId?: string }
  | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const money = (n: number) => new Prisma.Decimal(n.toFixed(2));
const isManagerRole = (role: string) => role === "OWNER" || role === "MANAGER";

export type QuotationStatusFilter =
  | "ALL"
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED";

export type QuotationRow = {
  id: string;
  number: string;
  issueDate: string;
  validUntil: string | null;
  customerName: string | null;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  totalAmount: string;
  notes: string | null;
  itemCount: number;
  convertible: boolean;
};

export type QuotationCounts = {
  all: number;
  draft: number;
  sent: number;
  accepted: number;
  rejected: number;
  expired: number;
};

export type QuotationListResult = {
  rows: QuotationRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: QuotationCounts;
};

export type QuotationLine = {
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
};

export type QuotationDetail = {
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  issueDate: string;
  validUntil: string | null;
  totalAmount: string;
  customerName: string | null;
  notes: string | null;
  items: { name: string; qty: number; unitPrice: string; subtotal: string; productId: string | null }[];
};

// Both delegate to the atomic per-business counter (lib/invoice.ts). The old
// read-the-last-100-rows approach collided under concurrent creates.
async function nextQuotationNumber(tx: Prisma.TransactionClient, businessId: string) {
  return nextDocumentNumber(businessId, "QUOTATION", tx);
}

async function nextInvoiceNumber(tx: Prisma.TransactionClient, businessId: string) {
  return nextDocumentNumber(businessId, "INVOICE", tx);
}

function validateLines(lines: QuotationLine[]) {
  if (!lines?.length) return "Add at least one line item.";
  for (const l of lines) {
    if (!l.name?.trim()) return "Every line needs a description.";
    if (!Number.isInteger(l.qty) || l.qty < 1) return `Invalid quantity for “${l.name}”.`;
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) return `Invalid price for “${l.name}”.`;
  }
  return null;
}

/* ------------------------------------------------------------------ list */

export async function listQuotationsAction(opts: {
  search?: string;
  status?: QuotationStatusFilter;
  page?: number;
  pageSize?: number;
}): Promise<QuotationListResult> {
  const session = await requireSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const baseWhere: Prisma.QuotationWhereInput = {
    businessId: session.businessId,
    ...(term
      ? {
          OR: [
            { number: { contains: term, mode: "insensitive" as const } },
            { customer: { name: { contains: term, mode: "insensitive" as const } } },
            { items: { some: { name: { contains: term, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const where: Prisma.QuotationWhereInput = {
    ...baseWhere,
    ...(opts.status && opts.status !== "ALL" ? { status: opts.status } : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        issueDate: true,
        validUntil: true,
        status: true,
        totalAmount: true,
        notes: true,
        customer: { select: { name: true } },
        items: { select: { id: true } },
      },
    }),
    prisma.quotation.count({ where }),
    prisma.quotation.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: QuotationCounts = {
    all: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
  };
  for (const g of grouped) {
    counts.all += g._count._all;
    if (g.status === "DRAFT") counts.draft = g._count._all;
    else if (g.status === "SENT") counts.sent = g._count._all;
    else if (g.status === "ACCEPTED") counts.accepted = g._count._all;
    else if (g.status === "REJECTED") counts.rejected = g._count._all;
    else if (g.status === "EXPIRED") counts.expired = g._count._all;
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      issueDate: r.issueDate.toISOString(),
      validUntil: r.validUntil?.toISOString() ?? null,
      customerName: r.customer?.name ?? null,
      status: r.status,
      totalAmount: r.totalAmount.toString(),
      notes: r.notes,
      itemCount: r.items.length,
      convertible: r.status === "DRAFT" || r.status === "SENT" || r.status === "ACCEPTED",
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

/* ---------------------------------------------------------------- detail */

export async function getQuotationDetailAction(quotationId: string): Promise<
  { ok: true; quotation: QuotationDetail } | { ok: false; error: string }
> {
  const session = await requireSession();
  const q = await prisma.quotation.findFirst({
    where: { id: quotationId, businessId: session.businessId },
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      validUntil: true,
      totalAmount: true,
      notes: true,
      customer: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          name: true,
          qty: true,
          unitPrice: true,
          subtotal: true,
          productId: true,
        },
      },
    },
  });
  if (!q) return { ok: false, error: "Quotation not found." };

  return {
    ok: true,
    quotation: {
      id: q.id,
      number: q.number,
      status: q.status,
      issueDate: q.issueDate.toISOString(),
      validUntil: q.validUntil?.toISOString() ?? null,
      totalAmount: q.totalAmount.toString(),
      customerName: q.customer?.name ?? null,
      notes: q.notes,
      items: q.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice.toString(),
        subtotal: i.subtotal.toString(),
        productId: i.productId,
      })),
    },
  };
}

/* ---------------------------------------------------------------- create */

export async function createQuotationAction(input: {
  customerId?: string | null;
  validUntil?: string | null;
  notes?: string;
  status?: "DRAFT" | "SENT";
  lines: QuotationLine[];
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can create quotations." };
  }
  const lineError = validateLines(input.lines);
  if (lineError) return { ok: false, error: lineError };

  const total = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const number = await nextQuotationNumber(tx, session.businessId);
      return tx.quotation.create({
        data: {
          businessId: session.businessId,
          customerId: input.customerId || null,
          number,
          status: input.status ?? "DRAFT",
          validUntil: input.validUntil ? new Date(input.validUntil) : null,
          totalAmount: money(total),
          notes: input.notes?.trim() || null,
          items: {
            create: input.lines.map((l) => ({
              productId: l.productId || null,
              name: l.name.trim(),
              qty: l.qty,
              unitPrice: money(l.unitPrice),
              subtotal: money(l.qty * l.unitPrice),
            })),
          },
        },
        select: { id: true, number: true },
      });
    });

    revalidatePath("/dashboard/quotations");
    return { ok: true, id: result.id, number: result.number };
  } catch {
    return { ok: false, error: "Could not create quotation. Please try again." };
  }
}

/* --------------------------------------------------------------- update */

export async function updateQuotationStatusAction(
  quotationId: string,
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED",
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can update quotations." };
  }
  try {
    // businessId scope: prevent cross-tenant status changes
    const q = await prisma.quotation.findFirst({
      where: { id: quotationId, businessId: session.businessId },
      select: { id: true, number: true },
    });
    if (!q) return { ok: false, error: "Quotation not found." };
    await prisma.quotation.update({
      where: { id: q.id },
      data: { status },
    });
    revalidatePath("/dashboard/quotations");
    return { ok: true, id: q.id, number: q.number };
  } catch {
    return { ok: false, error: "Quotation not found." };
  }
}

export async function deleteQuotationAction(
  quotationId: string,
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can delete quotations." };
  }
  try {
    const q = await prisma.quotation.findFirst({
      where: { id: quotationId, businessId: session.businessId },
      select: { id: true, number: true, status: true },
    });
    if (!q) return { ok: false, error: "Quotation not found." };
    if (q.status === "ACCEPTED") {
      return { ok: false, error: "Accepted quotations cannot be deleted — reject or convert them instead." };
    }
    await prisma.quotation.delete({ where: { id: q.id } });
    revalidatePath("/dashboard/quotations");
    return { ok: true, id: q.id, number: q.number };
  } catch {
    return { ok: false, error: "Could not delete quotation. Please try again." };
  }
}

/* -------------------------------------------------------------- convert */

export async function convertQuotationToInvoiceAction(
  quotationId: string,
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can convert quotations." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findFirst({
        where: { id: quotationId, businessId: session.businessId },
        select: {
          id: true,
          number: true,
          status: true,
          customerId: true,
          totalAmount: true,
          notes: true,
          items: {
            select: {
              productId: true,
              name: true,
              qty: true,
              unitPrice: true,
              subtotal: true,
            },
          },
        },
      });
      if (!q) throw new Error("Quotation not found.");
      if (q.status === "REJECTED" || q.status === "EXPIRED") {
        throw new Error("This quotation can no longer be converted.");
      }

      const number = await nextInvoiceNumber(tx, session.businessId);
      const inv = await tx.invoice.create({
        data: {
          businessId: session.businessId,
          customerId: q.customerId,
          number,
          status: "ISSUED",
          totalAmount: q.totalAmount,
          amountPaid: 0,
          notes: `Converted from ${q.number}${q.notes ? ` — ${q.notes}` : ""}`,
          items: {
            create: q.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
            })),
          },
        },
        select: { id: true, number: true },
      });

      await tx.quotation.update({
        where: { id: q.id },
        data: { status: "ACCEPTED" },
      });

      return inv;
    });

    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/quotations");
    return { ok: true, id: result.id, invoiceId: result.id, number: result.number };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Quotation not found." || msg.includes("no longer")) {
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Could not convert quotation. Please try again." };
  }
}

export async function convertQuotationToSaleAction(
  quotationId: string,
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can convert quotations." };
  }

  try {
    // The invoice number is reserved atomically (see lib/invoice.ts) and the
    // transaction retries with a fresh number if a collision ever occurs.
    const result = await withDocumentNumberRetry(async (tx, invoiceNo) => {
      const q = await tx.quotation.findFirst({
        where: { id: quotationId, businessId: session.businessId },
        select: {
          id: true,
          number: true,
          status: true,
          customerId: true,
          totalAmount: true,
          items: {
            select: {
              productId: true,
              name: true,
              qty: true,
              unitPrice: true,
              subtotal: true,
            },
          },
        },
      });
      if (!q) throw new Error("Quotation not found.");
      if (q.status === "REJECTED" || q.status === "EXPIRED") {
        throw new Error("This quotation can no longer be converted.");
      }
      if (q.items.some((i) => !i.productId)) {
        throw new Error("Custom lines without a product cannot become a sale. Convert to an invoice instead.");
      }

      const location = await tx.location.findFirst({
        where: { businessId: session.businessId },
        orderBy: { name: "asc" },
        select: { id: true },
      });
      if (!location) throw new Error("No location found for this business.");

      const total = Number(q.totalAmount);
      const sale = await tx.sale.create({
        data: {
          businessId: session.businessId,
          locationId: location.id,
          invoiceNo,
          customerId: q.customerId,
          soldById: session.id,
          status: "COMPLETED",
          paymentMethod: "CASH",
          paymentStatus: "PAID",
          totalAmount: q.totalAmount,
          totalPaid: q.totalAmount,
          due: money(0),
          itemsCount: q.items.reduce((s, i) => s + i.qty, 0),
          items: {
            create: q.items.map((i) => ({
              productId: i.productId!,
              qty: i.qty,
              unitPrice: i.unitPrice,
              discount: money(0),
              subtotal: i.subtotal,
            })),
          },
        },
        select: { id: true, invoiceNo: true },
      });

      for (const item of q.items) {
        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: item.productId!,
              locationId: location.id,
            },
          },
          update: { quantity: { decrement: item.qty } },
          create: {
            productId: item.productId!,
            locationId: location.id,
            quantity: -item.qty,
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId!,
            locationId: location.id,
            type: "SALE",
            quantity: -item.qty,
            referenceId: sale.id,
            notes: `Sale ${invoiceNo} · from ${q.number}`,
            createdById: session.id,
          },
        });
      }

      await tx.payment.create({
        data: {
          saleId: sale.id,
          method: "CASH",
          amount: q.totalAmount,
          reference: `RCPT-${invoiceNo}`,
        },
      });

      await tx.quotation.update({
        where: { id: q.id },
        data: { status: "ACCEPTED" },
      });

      return { saleId: sale.id, invoiceNo: sale.invoiceNo, total };
      },
      { businessId: session.businessId, kind: "SALE" },
    );

    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/quotations");
    return { ok: true, id: result.saleId, invoiceNo: result.invoiceNo };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg === "Quotation not found." ||
      msg.includes("no longer") ||
      msg.includes("Custom lines") ||
      msg.includes("No location")
    ) {
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Could not convert quotation. Please try again." };
  }
}
