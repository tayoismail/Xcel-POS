"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type DashboardRangeInput = {
  /** yyyy-MM-dd (local). Defaults to today when omitted. */
  from?: string;
  /** yyyy-MM-dd (local), inclusive. Defaults to today when omitted. */
  to?: string;
};

export type SalesSeriesPoint = {
  /** Bucket label (e.g. "14:00" or "Sep 18") */
  label: string;
  /** ISO timestamp at bucket start (for tooltips) */
  key: string;
  sales: number;
  expenses: number;
};

export type DebtorRow = {
  id: string;
  number: string;
  customerName: string | null;
  issueDate: string;
  dueDate: string | null;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  daysOverdue: number;
};

export type StockAlertRow = {
  id: string;
  productName: string;
  sku: string;
  locationName: string;
  quantity: number;
  alertAt: number;
  status: "NEGATIVE" | "OUT" | "LOW";
};

export type RecentSaleRow = {
  id: string;
  invoiceNo: string;
  customerName: string | null;
  soldByName: string;
  totalAmount: string;
  paymentStatus: string;
  status: "COMPLETED" | "REFUNDED" | "CANCELLED";
  createdAt: string;
};

export type ExpenseCategorySlice = {
  category: string;
  amount: string;
};

export type DashboardStats = {
  range: { from: string; to: string };
  totalSales: string;
  invoiceDue: string;
  totalPayments: string;
  netSales: string;
  expenses: string;
  tickets: number;
  salesTrendPct: number | null;
  salesSeries: SalesSeriesPoint[];
  expenseCategories: ExpenseCategorySlice[];
  debtors: DebtorRow[];
  debtorsTotal: string;
  debtorsCount: number;
  stockAlerts: StockAlertRow[];
  stockAlertsTotal: number;
  recentSales: RecentSaleRow[];
  updatedAt: string;
};

function parseYmd(ymd: string | undefined, fallback: Date): Date {
  if (!ymd) return new Date(fallback);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(fallback);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n: number): string {
  return n.toFixed(2);
}

const monthFmt = new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric" });
const hourFmt = new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Dashboard KPIs + chart series + debtors + stock alerts for a date range.
 * Feeds the live dashboard home (refetched on range change and Supabase Realtime).
 */
export async function getDashboardStats(
  input: DashboardRangeInput = {},
): Promise<DashboardStats | null> {
  const session = await getSessionUser();
  if (!session) return null;
  // Mirror the page-level guard: staff must not pull dashboard stats directly.
  if (!can(session.role, "reports.view")) return null;

  const today = startOfDay(new Date());
  let from = startOfDay(parseYmd(input.from, today));
  let to = endOfDay(parseYmd(input.to, today));
  if (to < from) {
    const tmp = from;
    from = startOfDay(to);
    to = endOfDay(tmp);
  }
  // Cap range to 366 days to keep series queries sane
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    to = endOfDay(new Date(from.getTime() + maxMs - 1));
  }

  const businessId = session.businessId;
  const range = { gte: from, lte: to };

  // Previous equal-length window for the sales trend
  const spanMs = to.getTime() - from.getTime() + 1;
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - spanMs);

  const dayCount = Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000) + 1;
  const hourly = dayCount <= 1;

  const [
    salesAgg,
    prevSalesAgg,
    paymentsAgg,
    expensesAgg,
    openInvoiceAgg,
    debtorsRaw,
    expenseByCategory,
    salesRows,
    expenseRows,
    stockRows,
    recentSales,
  ] = await Promise.all([
    prisma.sale.aggregate({
      where: { businessId, status: "COMPLETED", createdAt: range },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.aggregate({
      where: { businessId, status: "COMPLETED", createdAt: { gte: prevFrom, lte: prevTo } },
      _sum: { totalAmount: true },
    }),
    prisma.payment.aggregate({
      where: { sale: { businessId }, createdAt: range },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { businessId, date: range },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        businessId,
        status: { in: ["DRAFT", "ISSUED"] },
      },
      _sum: { totalAmount: true, amountPaid: true },
    }),
    prisma.invoice.findMany({
      where: {
        businessId,
        status: { in: ["DRAFT", "ISSUED"] },
      },
      orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
      take: 100,
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        totalAmount: true,
        amountPaid: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { businessId, date: range },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
    prisma.sale.findMany({
      where: { businessId, status: "COMPLETED", createdAt: range },
      select: { createdAt: true, totalAmount: true },
    }),
    prisma.expense.findMany({
      where: { businessId, date: range },
      select: { date: true, amount: true },
    }),
    prisma.stockLevel.findMany({
      where: { location: { businessId } },
      select: {
        id: true,
        quantity: true,
        product: {
          select: { name: true, sku: true, alertAt: true, deletedAt: true },
        },
        location: { select: { name: true } },
      },
      take: 2000,
    }),
    prisma.sale.findMany({
      where: { businessId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        invoiceNo: true,
        totalAmount: true,
        paymentStatus: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true } },
        soldBy: { select: { name: true } },
      },
    }),
  ]);

  const totalSales = Number(salesAgg._sum.totalAmount ?? 0);
  const prevSales = Number(prevSalesAgg._sum.totalAmount ?? 0);
  const totalPayments = Number(paymentsAgg._sum.amount ?? 0);
  const expenses = Number(expensesAgg._sum.amount ?? 0);
  const openTotal = Number(openInvoiceAgg._sum.totalAmount ?? 0);
  const openPaid = Number(openInvoiceAgg._sum.amountPaid ?? 0);
  const invoiceDue = Math.max(0, openTotal - openPaid);
  const tickets = salesAgg._count._all;

  let salesTrendPct: number | null = null;
  if (prevSales > 0) {
    salesTrendPct = Math.round(((totalSales - prevSales) / prevSales) * 1000) / 10;
  } else if (totalSales > 0 && prevSales === 0 && spanMs < 30 * 86400000) {
    salesTrendPct = 100;
  }

  // ---- chart series (hourly for ≤1 day, otherwise daily) ----
  const buckets = new Map<string, { label: string; sales: number; expenses: number }>();

  const bucketKeyFor = (d: Date): { key: string; label: string } => {
    if (hourly) {
      const dt = new Date(d);
      dt.setMinutes(0, 0, 0);
      return { key: dt.toISOString(), label: hourFmt.format(dt) };
    }
    const dt = startOfDay(d);
    return { key: ymd(dt), label: monthFmt.format(dt) };
  };

  // Seed empty buckets across the range so the chart has continuous x-axis
  if (hourly) {
    const h = startOfDay(from);
    for (let i = 0; i < 24; i++) {
      const dt = new Date(h.getTime() + i * 3600000);
      const { key, label } = bucketKeyFor(dt);
      buckets.set(key, { label, sales: 0, expenses: 0 });
    }
  } else {
    const d0 = startOfDay(from);
    const d1 = startOfDay(to);
    for (let t = d0.getTime(); t <= d1.getTime(); t += 86400000) {
      const { key, label } = bucketKeyFor(new Date(t));
      buckets.set(key, { label, sales: 0, expenses: 0 });
    }
  }

  for (const s of salesRows) {
    const { key, label } = bucketKeyFor(s.createdAt);
    const b = buckets.get(key) ?? { label, sales: 0, expenses: 0 };
    b.sales += Number(s.totalAmount);
    buckets.set(key, b);
  }
  for (const e of expenseRows) {
    const { key, label } = bucketKeyFor(e.date);
    const b = buckets.get(key) ?? { label, sales: 0, expenses: 0 };
    b.expenses += Number(e.amount);
    buckets.set(key, b);
  }

  const salesSeries: SalesSeriesPoint[] = [...buckets.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    sales: Math.round(v.sales * 100) / 100,
    expenses: Math.round(v.expenses * 100) / 100,
  }));

  // ---- debtors (open invoice balance > 0) ----
  const now = Date.now();
  const debtors: DebtorRow[] = [];
  let debtorsTotal = 0;
  for (const inv of debtorsRaw) {
    const total = Number(inv.totalAmount);
    const paid = Number(inv.amountPaid);
    const balance = total - paid;
    if (balance <= 0.009) continue;
    const due = inv.dueDate ? endOfDay(inv.dueDate).getTime() : null;
    const daysOverdue = due !== null && due < now ? Math.ceil((now - due) / 86400000) : 0;
    debtors.push({
      id: inv.id,
      number: inv.number,
      customerName: inv.customer?.name ?? null,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      totalAmount: money(total),
      amountPaid: money(paid),
      balance: money(balance),
      daysOverdue,
    });
    debtorsTotal += balance;
  }

  // ---- stock alerts (negative first, then out, then low) ----
  const alerts: StockAlertRow[] = [];
  for (const row of stockRows) {
    const p = row.product;
    if (p.deletedAt !== null) continue;
    const qty = row.quantity;
    const alertAt = p.alertAt;
    let status: StockAlertRow["status"] | null = null;
    if (qty < 0) status = "NEGATIVE";
    else if (qty === 0 && alertAt >= 0) status = "OUT";
    else if (alertAt > 0 && qty <= alertAt) status = "LOW";
    if (!status) continue;
    alerts.push({
      id: row.id,
      productName: p.name,
      sku: p.sku,
      locationName: row.location.name,
      quantity: qty,
      alertAt,
      status,
    });
  }
  const severity = { NEGATIVE: 0, OUT: 1, LOW: 2 } as const;
  alerts.sort((a, b) => {
    const s = severity[a.status] - severity[b.status];
    if (s !== 0) return s;
    return a.quantity - b.quantity;
  });

  const expenseCategories: ExpenseCategorySlice[] = expenseByCategory.map((c) => ({
    category: c.category,
    amount: money(Number(c._sum.amount ?? 0)),
  }));

  return {
    range: { from: ymd(from), to: ymd(to) },
    totalSales: money(totalSales),
    invoiceDue: money(invoiceDue),
    totalPayments: money(totalPayments),
    netSales: money(totalSales - expenses),
    expenses: money(expenses),
    tickets,
    salesTrendPct,
    salesSeries,
    expenseCategories,
    debtors: debtors.slice(0, 25),
    debtorsTotal: money(debtorsTotal),
    debtorsCount: debtors.length,
    stockAlerts: alerts.slice(0, 50),
    stockAlertsTotal: alerts.length,
    recentSales: recentSales.map((s) => ({
      id: s.id,
      invoiceNo: s.invoiceNo,
      customerName: s.customer?.name ?? null,
      soldByName: s.soldBy.name,
      totalAmount: s.totalAmount.toString(),
      paymentStatus: s.paymentStatus,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
    updatedAt: new Date().toISOString(),
  };
}
