"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { nextDocumentNumber } from "@/lib/invoice";

export type ActionState =
  | { ok: true; id?: string; number?: string; invoiceNo?: string }
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

export type InvoiceStatusFilter = "ALL" | "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";

export type InvoiceRow = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  customerName: string | null;
  saleInvoiceNo: string | null;
  status: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  totalAmount: string;
  amountPaid: string;
  balance: string;
  notes: string | null;
};

export type InvoiceCounts = {
  all: number;
  draft: number;
  issued: number;
  paid: number;
  cancelled: number;
};

export type InvoiceListResult = {
  rows: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: InvoiceCounts;
};

export type InvoiceLine = {
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
};

export type InvoiceDetail = {
  id: string;
  number: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  issueDate: string;
  dueDate: string | null;
  totalAmount: string;
  amountPaid: string;
  notes: string | null;
  businessName: string;
  customerName: string | null;
  saleInvoiceNo: string | null;
  items: { name: string; qty: number; unitPrice: string; subtotal: string }[];
};

export type CreditSaleRow = {
  id: string;
  invoiceNo: string;
  createdAt: string;
  customerName: string | null;
  soldByName: string;
  totalAmount: string;
  totalPaid: string;
  due: string;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
};

export type CustomerOption = {
  id: string;
  name: string;
  phone: string | null;
};

export async function listCustomerOptionsAction(): Promise<CustomerOption[]> {
  const session = await requireManagerSession();
  return prisma.customer.findMany({
    where: { businessId: session.businessId, deletedAt: null },
    orderBy: { name: "asc" },
    take: 250,
    select: { id: true, name: true, phone: true },
  });
}

// Delegates to the atomic per-business counter (lib/invoice.ts); the old
// read-the-last-100-rows approach collided under concurrent creates.
async function nextInvoiceNumber(tx: Prisma.TransactionClient, businessId: string) {
  return nextDocumentNumber(businessId, "INVOICE", tx);
}

function validateLines(lines: InvoiceLine[]) {
  if (!lines?.length) return "Add at least one line item.";
  for (const l of lines) {
    if (!l.name?.trim()) return "Every line needs a description.";
    if (!Number.isInteger(l.qty) || l.qty < 1) return `Invalid quantity for “${l.name}”.`;
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0) return `Invalid price for “${l.name}”.`;
  }
  return null;
}

/* ------------------------------------------------------------------ list */

export async function listInvoicesAction(opts: {
  search?: string;
  status?: InvoiceStatusFilter;
  page?: number;
  pageSize?: number;
}): Promise<InvoiceListResult> {
  const session = await requireManagerSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const baseWhere: Prisma.InvoiceWhereInput = {
    businessId: session.businessId,
    ...(term
      ? {
          OR: [
            { number: { contains: term, mode: "insensitive" as const } },
            { customer: { name: { contains: term, mode: "insensitive" as const } } },
            { sale: { invoiceNo: { contains: term, mode: "insensitive" as const } } },
            { items: { some: { name: { contains: term, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const where: Prisma.InvoiceWhereInput = {
    ...baseWhere,
    ...(opts.status && opts.status !== "ALL" ? { status: opts.status } : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        notes: true,
        customer: { select: { name: true } },
        sale: { select: { invoiceNo: true } },
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: InvoiceCounts = {
    all: 0,
    draft: 0,
    issued: 0,
    paid: 0,
    cancelled: 0,
  };
  for (const g of grouped) {
    counts.all += g._count._all;
    if (g.status === "DRAFT") counts.draft = g._count._all;
    else if (g.status === "ISSUED") counts.issued = g._count._all;
    else if (g.status === "PAID") counts.paid = g._count._all;
    else if (g.status === "CANCELLED") counts.cancelled = g._count._all;
  }

  return {
    rows: rows.map((r) => {
      const totalAmt = Number(r.totalAmount);
      const paid = Number(r.amountPaid);
      return {
        id: r.id,
        number: r.number,
        issueDate: r.issueDate.toISOString(),
        dueDate: r.dueDate?.toISOString() ?? null,
        customerName: r.customer?.name ?? null,
        saleInvoiceNo: r.sale?.invoiceNo ?? null,
        status: r.status,
        totalAmount: r.totalAmount.toString(),
        amountPaid: r.amountPaid.toString(),
        balance: Math.max(0, totalAmt - paid).toFixed(2),
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

/* ---------------------------------------------------------------- detail */

export async function getInvoiceDetailAction(invoiceId: string): Promise<
  { ok: true; invoice: InvoiceDetail } | { ok: false; error: string }
> {
  const session = await requireManagerSession();
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId: session.businessId },
    select: {
      id: true,
      number: true,
      status: true,
      issueDate: true,
      dueDate: true,
      totalAmount: true,
      amountPaid: true,
      notes: true,
      customer: { select: { name: true, phone: true, email: true } },
      sale: { select: { invoiceNo: true } },
      items: {
        orderBy: { id: "asc" },
        select: { name: true, qty: true, unitPrice: true, subtotal: true },
      },
    },
  });
  if (!inv) return { ok: false, error: "Invoice not found." };

  return {
    ok: true,
    invoice: {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
      totalAmount: inv.totalAmount.toString(),
      amountPaid: inv.amountPaid.toString(),
      notes: inv.notes,
      businessName: session.businessName,
      customerName: inv.customer?.name ?? null,
      saleInvoiceNo: inv.sale?.invoiceNo ?? null,
      items: inv.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        unitPrice: i.unitPrice.toString(),
        subtotal: i.subtotal.toString(),
      })),
    },
  };
}

/* --------------------------------------------------------------- create */

export async function createInvoiceAction(input: {
  customerId?: string | null;
  dueDate?: string | null;
  notes?: string;
  status?: "DRAFT" | "ISSUED";
  lines: InvoiceLine[];
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can create invoices." };
  }
  const lineError = validateLines(input.lines);
  if (lineError) return { ok: false, error: lineError };

  const total = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const number = await nextInvoiceNumber(tx, session.businessId);
      const inv = await tx.invoice.create({
        data: {
          businessId: session.businessId,
          customerId: input.customerId || null,
          number,
          status: input.status ?? "ISSUED",
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          totalAmount: money(total),
          amountPaid: 0,
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
      return inv;
    });

    revalidatePath("/dashboard/invoices");
    return { ok: true, id: result.id, number: result.number };
  } catch {
    return { ok: false, error: "Could not create invoice. Please try again." };
  }
}

/** Sales that are unpaid/partial and do not yet have an invoice. */
export async function listCreditSalesAction(): Promise<CreditSaleRow[]> {
  const session = await requireManagerSession();
  const sales = await prisma.sale.findMany({
    where: {
      businessId: session.businessId,
      status: "COMPLETED",
      paymentStatus: { in: ["UNPAID", "PARTIAL"] },
      invoices: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      invoiceNo: true,
      createdAt: true,
      totalAmount: true,
      totalPaid: true,
      due: true,
      paymentStatus: true,
      customer: { select: { name: true } },
      soldBy: { select: { name: true } },
    },
  });
  return sales.map((s) => ({
    id: s.id,
    invoiceNo: s.invoiceNo,
    createdAt: s.createdAt.toISOString(),
    customerName: s.customer?.name ?? null,
    soldByName: s.soldBy.name,
    totalAmount: s.totalAmount.toString(),
    totalPaid: s.totalPaid.toString(),
    due: s.due.toString(),
    paymentStatus: s.paymentStatus,
  }));
}

export async function createInvoiceFromSaleAction(
  saleId: string,
): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can generate invoices." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId: session.businessId },
        select: {
          id: true,
          invoiceNo: true,
          customerId: true,
          totalAmount: true,
          totalPaid: true,
          due: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              qty: true,
              unitPrice: true,
              subtotal: true,
              product: { select: { name: true } },
            },
          },
          invoices: { select: { id: true }, take: 1 },
        },
      });
      if (!sale) throw new Error("Sale not found.");
      if (sale.invoices.length) throw new Error("This sale already has an invoice.");

      const number = await nextInvoiceNumber(tx, session.businessId);
      const paid = Number(sale.totalPaid);
      const due = Number(sale.due);

      const inv = await tx.invoice.create({
        data: {
          businessId: session.businessId,
          saleId: sale.id,
          customerId: sale.customerId,
          number,
          status: due <= 0 ? "PAID" : "ISSUED",
          issueDate: new Date(),
          totalAmount: sale.totalAmount,
          amountPaid: sale.totalPaid,
          notes: `Generated from sale ${sale.invoiceNo}`,
          items: {
            create: sale.items.map((i) => ({
              productId: i.productId,
              name: i.product.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              subtotal: i.subtotal,
            })),
          },
        },
        select: { id: true, number: true },
      });
      return { ...inv, paid, due };
    });

    revalidatePath("/dashboard/invoices");
    return { ok: true, id: result.id, number: result.number };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "Sale not found." || msg.startsWith("This sale already")) {
      return { ok: false, error: msg };
    }
    return { ok: false, error: "Could not generate invoice. Please try again." };
  }
}

/* ---------------------------------------------------------------- update */

export async function updateInvoiceAction(input: {
  invoiceId: string;
  status?: "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";
  amountPaid?: number;
  dueDate?: string | null;
  notes?: string;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Only managers can update invoices." };
  }

  try {
    const inv = await prisma.invoice.findFirst({
      where: { id: input.invoiceId, businessId: session.businessId },
      select: { id: true, number: true, totalAmount: true },
    });
    if (!inv) return { ok: false, error: "Invoice not found." };

    const total = Number(inv.totalAmount);
    let status = input.status;
    let amountPaid = input.amountPaid;

    if (status === "PAID") amountPaid = total;
    if (typeof amountPaid === "number") {
      amountPaid = Math.min(Math.max(0, amountPaid), total);
      if (amountPaid >= total && status !== "CANCELLED") status = "PAID";
      if (amountPaid < total && status === "PAID") status = "ISSUED";
    }

    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        ...(status ? { status } : {}),
        ...(typeof amountPaid === "number" ? { amountPaid: money(amountPaid) } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });

    revalidatePath("/dashboard/invoices");
    return { ok: true, id: inv.id, number: inv.number };
  } catch {
    return { ok: false, error: "Could not update invoice. Please try again." };
  }
}
