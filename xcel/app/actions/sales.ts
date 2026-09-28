"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

type ActionState = { ok: true } | { ok: false; error: string };

async function requireSession() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  return session;
}

const money = (n: number) => new Prisma.Decimal(n.toFixed(2));

const isManagerRole = (role: string) => role === "OWNER" || role === "MANAGER";

export type SaleRow = {
  id: string;
  invoiceNo: string;
  createdAt: string;
  customerName: string | null;
  soldByName: string;
  locationName: string;
  itemsCount: number;
  totalAmount: string;
  totalPaid: string;
  due: string;
  paymentMethod: "CASH" | "TRANSFER" | "SPLIT" | "CREDIT" | "POS";
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  status: "COMPLETED" | "REFUNDED" | "CANCELLED";
};

export type SaleCounts = {
  all: number;
  paid: number;
  partial: number;
  unpaid: number;
};

export type SaleListResult = {
  rows: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  counts: SaleCounts;
};

export type SalespersonOption = { id: string; name: string; role: string };

export type SaleDetail = {
  id: string;
  invoiceNo: string;
  createdAt: string;
  status: "COMPLETED" | "REFUNDED" | "CANCELLED";
  paymentMethod: "CASH" | "TRANSFER" | "SPLIT" | "CREDIT" | "POS";
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  totalAmount: string;
  totalPaid: string;
  due: string;
  itemsCount: number;
  customerName: string | null;
  soldByName: string;
  locationName: string;
  items: {
    name: string;
    qty: number;
    unitPrice: string;
    discount: string;
    subtotal: string;
  }[];
  payments: {
    id: string;
    method: string;
    amount: string;
    reference: string | null;
    createdAt: string;
  }[];
  invoices: {
    id: string;
    number: string;
    status: string;
    totalAmount: string;
    amountPaid: string;
    dueDate: string | null;
  }[];
};

/* ------------------------------------------------------------------ list */

export async function listSalespeopleAction(): Promise<SalespersonOption[]> {
  const session = await requireSession();
  const users = await prisma.user.findMany({
    where: { businessId: session.businessId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });
  return users;
}

export async function listSalesAction(opts: {
  search?: string;
  soldById?: string | "ALL";
  paymentStatus?: "PAID" | "PARTIAL" | "UNPAID" | "ALL";
  paymentMethod?: "CASH" | "TRANSFER" | "SPLIT" | "CREDIT" | "POS" | "ALL";
  page?: number;
  pageSize?: number;
}): Promise<SaleListResult> {
  const session = await requireSession();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const term = opts.search?.trim();

  const baseWhere: Prisma.SaleWhereInput = {
    businessId: session.businessId,
    ...(opts.soldById && opts.soldById !== "ALL" ? { soldById: opts.soldById } : {}),
    ...(opts.paymentMethod && opts.paymentMethod !== "ALL"
      ? { paymentMethod: opts.paymentMethod }
      : {}),
    ...(term
      ? {
          OR: [
            { invoiceNo: { contains: term, mode: "insensitive" as const } },
            { customer: { name: { contains: term, mode: "insensitive" as const } } },
            { customer: { phone: { contains: term } } },
            { soldBy: { name: { contains: term, mode: "insensitive" as const } } },
            { items: { some: { product: { name: { contains: term, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const where: Prisma.SaleWhereInput = {
    ...baseWhere,
    ...(opts.paymentStatus && opts.paymentStatus !== "ALL"
      ? { paymentStatus: opts.paymentStatus }
      : {}),
  };

  const [rows, total, allCount, grouped] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        invoiceNo: true,
        createdAt: true,
        itemsCount: true,
        totalAmount: true,
        totalPaid: true,
        due: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        customer: { select: { name: true } },
        soldBy: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
    prisma.sale.count({ where }),
    prisma.sale.count({ where: baseWhere }),
    prisma.sale.groupBy({
      by: ["paymentStatus"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: SaleCounts = { all: allCount, paid: 0, partial: 0, unpaid: 0 };
  for (const g of grouped) {
    if (g.paymentStatus === "PAID") counts.paid = g._count._all;
    else if (g.paymentStatus === "PARTIAL") counts.partial = g._count._all;
    else if (g.paymentStatus === "UNPAID") counts.unpaid = g._count._all;
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoiceNo,
      createdAt: r.createdAt.toISOString(),
      customerName: r.customer?.name ?? null,
      soldByName: r.soldBy.name,
      locationName: r.location.name,
      itemsCount: r.itemsCount,
      totalAmount: r.totalAmount.toFixed(2),
      totalPaid: r.totalPaid.toFixed(2),
      due: r.due.toFixed(2),
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      status: r.status,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  };
}

/* ---------------------------------------------------------------- detail */

export async function getSaleDetailAction(
  saleId: string,
): Promise<{ ok: true; sale: SaleDetail } | { ok: false; error: string }> {
  const session = await requireSession();
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId: session.businessId },
    select: {
      id: true,
      invoiceNo: true,
      createdAt: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      totalPaid: true,
      due: true,
      itemsCount: true,
      customer: { select: { name: true } },
      soldBy: { select: { name: true } },
      location: { select: { name: true } },
      items: {
        select: {
          qty: true,
          unitPrice: true,
          discount: true,
          subtotal: true,
          product: { select: { name: true } },
        },
      },
      payments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          number: true,
          status: true,
          totalAmount: true,
          amountPaid: true,
          dueDate: true,
        },
      },
    },
  });
  if (!sale) return { ok: false, error: "Sale not found." };

  return {
    ok: true,
    sale: {
      id: sale.id,
      invoiceNo: sale.invoiceNo,
      createdAt: sale.createdAt.toISOString(),
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      totalAmount: sale.totalAmount.toFixed(2),
      totalPaid: sale.totalPaid.toFixed(2),
      due: sale.due.toFixed(2),
      itemsCount: sale.itemsCount,
      customerName: sale.customer?.name ?? null,
      soldByName: sale.soldBy.name,
      locationName: sale.location.name,
      items: sale.items.map((i) => ({
        name: i.product.name,
        qty: i.qty,
        unitPrice: i.unitPrice.toFixed(2),
        discount: i.discount.toFixed(2),
        subtotal: i.subtotal.toFixed(2),
      })),
      payments: sale.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount.toFixed(2),
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
      })),
      invoices: sale.invoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        totalAmount: inv.totalAmount.toFixed(2),
        amountPaid: inv.amountPaid.toFixed(2),
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      })),
    },
  };
}

/* ------------------------------------------------------------------ edit */

export async function updateSaleAction(input: {
  saleId: string;
  paymentMethod: "CASH" | "TRANSFER" | "SPLIT" | "CREDIT" | "POS";
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  amountPaid?: number;
}): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Manager access required to edit sales." };
  }

  const sale = await prisma.sale.findFirst({
    where: { id: input.saleId, businessId: session.businessId },
    select: { id: true, invoiceNo: true, totalAmount: true, status: true },
  });
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.status === "REFUNDED") {
    return { ok: false, error: "Refunded sales can't be edited." };
  }

  const total = Number(sale.totalAmount);
  let paid: number;
  if (input.paymentStatus === "PAID") paid = total;
  else if (input.paymentStatus === "UNPAID") paid = 0;
  else paid = Math.min(Math.max(0, Number(input.amountPaid ?? 0)), total);

  try {
    await prisma.sale.update({
      where: { id: sale.id },
      data: {
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        totalPaid: money(paid),
        due: money(total - paid),
      },
    });
    await audit({
      businessId: session.businessId,
      userId: session.id,
      action: "SALE_EDIT",
      entity: "Sale",
      entityId: sale.id,
      summary: `Updated payment on ${sale.invoiceNo}: ${input.paymentMethod} · ${input.paymentStatus}`,
      meta: {
        invoiceNo: sale.invoiceNo,
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        amountPaid: paid,
      },
    });
    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/sales");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}

/* -------------------------------------------------------- mark refunded */

export async function markRefundedAction(saleId: string): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Manager access required to refund sales." };
  }

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId: session.businessId },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      locationId: true,
      items: { select: { productId: true, qty: true } },
    },
  });
  if (!sale) return { ok: false, error: "Sale not found." };
  if (sale.status === "REFUNDED") return { ok: false, error: "Sale is already refunded." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "REFUNDED" },
      });
      // Restock returned items + audit movements
      for (const item of sale.items) {
        await tx.stockLevel.upsert({
          where: {
            productId_locationId: {
              productId: item.productId,
              locationId: sale.locationId,
            },
          },
          update: { quantity: { increment: item.qty } },
          create: {
            productId: item.productId,
            locationId: sale.locationId,
            quantity: item.qty,
          },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            locationId: sale.locationId,
            type: "RETURN",
            quantity: item.qty,
            referenceId: sale.id,
            notes: `Refund ${sale.invoiceNo}`,
            createdById: session.id,
          },
        });
      }
      await audit({
        businessId: session.businessId,
        userId: session.id,
        action: "SALE_REFUND",
        entity: "Sale",
        entityId: sale.id,
        summary: `Refunded sale ${sale.invoiceNo}`,
        meta: { invoiceNo: sale.invoiceNo },
        tx,
      });
    });
    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/sales");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refund failed." };
  }
}

/* ---------------------------------------------------------------- delete */

export async function deleteSaleAction(saleId: string): Promise<ActionState> {
  const session = await requireSession();
  if (!isManagerRole(session.role)) {
    return { ok: false, error: "Manager access required to delete sales." };
  }

  const sale = await prisma.sale.findFirst({
    where: { id: saleId, businessId: session.businessId },
    select: {
      id: true,
      invoiceNo: true,
      status: true,
      locationId: true,
      totalAmount: true,
      items: { select: { productId: true, qty: true } },
    },
  });
  if (!sale) return { ok: false, error: "Sale not found." };

  try {
    await prisma.$transaction(async (tx) => {
      // Detach linked invoices, drop payments
      await tx.invoice.updateMany({
        where: { saleId: sale.id },
        data: { saleId: null },
      });
      await tx.payment.deleteMany({ where: { saleId: sale.id } });

      // Restock unless it was already refunded (which restocked once)
      if (sale.status !== "REFUNDED") {
        for (const item of sale.items) {
          await tx.stockLevel.upsert({
            where: {
              productId_locationId: {
                productId: item.productId,
                locationId: sale.locationId,
              },
            },
            update: { quantity: { increment: item.qty } },
            create: {
              productId: item.productId,
              locationId: sale.locationId,
              quantity: item.qty,
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              locationId: sale.locationId,
              type: "RETURN",
              quantity: item.qty,
              referenceId: sale.id,
              notes: `Sale deleted ${sale.invoiceNo}`,
              createdById: session.id,
            },
          });
        }
      }

      await tx.sale.delete({ where: { id: sale.id } });

      await audit({
        businessId: session.businessId,
        userId: session.id,
        action: "SALE_DELETE",
        entity: "Sale",
        entityId: sale.id,
        summary: `Deleted sale ${sale.invoiceNo} (₦${Number(sale.totalAmount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
        meta: {
          invoiceNo: sale.invoiceNo,
          totalAmount: String(sale.totalAmount),
          itemCount: sale.items.length,
          wasRefunded: sale.status === "REFUNDED",
        },
        tx,
      });
    });
    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard/sales");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}
