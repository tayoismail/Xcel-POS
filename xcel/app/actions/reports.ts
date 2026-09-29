"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/rbac";

/* ------------------------------------------------------------------ types */

export type ReportTab =
  | "invoices"
  | "sales"
  | "stock"
  | "purchases"
  | "profit"
  | "expenses"
  | "crm";

export type ReportFilters = {
  /** yyyy-MM-dd */
  from: string;
  /** yyyy-MM-dd, inclusive */
  to: string;
  productId?: string;
  customerId?: string;
  locationId?: string;
  categoryId?: string;
  /** Customer group (CRM): REGISTERED | WALK_IN */
  group?: string;
  brand?: string;
  paymentMethod?: "ALL" | "CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT";
  soldById?: string;
  /** HH:mm — only applied when the range is a single day */
  timeFrom?: string;
  /** HH:mm — only applied when the range is a single day */
  timeTo?: string;
};

export type ReportFilterOptions = {
  products: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  brands: string[];
  staff: { id: string; name: string }[];
};

export type SeriesPoint = { label: string; key: string; sales: number; expenses: number };

export type NamedBreakdown = { name: string; amount: number; count: number };

const money = (n: number) => n.toFixed(2);
const n = (v: unknown) => Number(v ?? 0);

/* ------------------------------------------------------- shared internals */

async function requireBusiness() {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized");
  // Mirror the page-level guard: salespeople must not pull reports directly.
  if (!can(session.role, "reports.view")) {
    throw new Error("Forbidden: your role cannot view reports.");
  }
  return session;
}

function parseYmd(ymd: string | undefined, fallback: Date): Date {
  if (!ymd) return new Date(fallback);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return new Date(fallback);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
}

function dayBounds(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return { s, e };
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Resolved absolute range + metadata shared by every report query. */
function resolveRange(f: ReportFilters) {
  const today = new Date();
  let from = dayBounds(parseYmd(f.from, today)).s;
  let to = dayBounds(parseYmd(f.to, today)).e;
  if (to < from) [from, to] = [dayBounds(to).s, dayBounds(from).e];
  const dayCount =
    Math.floor(
      (dayBounds(to).s.getTime() - dayBounds(from).s.getTime()) / 86400000,
    ) + 1;
  // Time-of-day window only makes sense within a single day
  const atTime = (d: Date, hhmm: string | undefined, end: boolean) => {
    if (!hhmm) return d;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return d;
    const x = new Date(d);
    x.setHours(Number(m[1]), Number(m[2]), end ? 59 : 0, end ? 999 : 0);
    return x;
  };
  if (dayCount === 1) {
    from = atTime(from, f.timeFrom, false);
    to = atTime(to, f.timeTo, true);
  }
  return { from, to, dayCount, hourly: dayCount <= 1 };
}

/** Sale-level Prisma where clause honoring every sales-side filter. */
function saleWhere(
  businessId: string,
  f: ReportFilters,
  opts?: { statuses?: ("COMPLETED" | "REFUNDED" | "CANCELLED")[]; dateField?: "createdAt" },
): Prisma.SaleWhereInput {
  const { from, to } = resolveRange(f);
  const itemFilters: Prisma.SaleItemWhereInput[] = [];
  if (f.productId) itemFilters.push({ productId: f.productId });
  if (f.categoryId) itemFilters.push({ product: { categoryId: f.categoryId } });
  if (f.brand) itemFilters.push({ product: { brand: f.brand } });

  return {
    businessId,
    ...(opts?.statuses ? { status: { in: opts.statuses } } : {}),
    [opts?.dateField ?? "createdAt"]: { gte: from, lte: to },
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.paymentMethod && f.paymentMethod !== "ALL"
      ? { paymentMethod: f.paymentMethod }
      : {}),
    ...(f.soldById ? { soldById: f.soldById } : {}),
    ...(itemFilters.length > 0 ? { items: { some: { AND: itemFilters } } } : {}),
  } as Prisma.SaleWhereInput;
}

function productWhere(businessId: string, f: ReportFilters): Prisma.ProductWhereInput {
  return {
    businessId,
    deletedAt: null,
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.brand ? { brand: f.brand } : {}),
    ...(f.productId ? { id: f.productId } : {}),
  };
}

/** Daily (or hourly for single-day) revenue/expense buckets. */
async function buildSeries(
  businessId: string,
  f: ReportFilters,
  statuses: ("COMPLETED" | "REFUNDED" | "CANCELLED")[],
): Promise<SeriesPoint[]> {
  const { from, to, dayCount, hourly } = resolveRange(f);
  const monthFmt = new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric" });
  const hourFmt = new Intl.DateTimeFormat("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const buckets = new Map<string, SeriesPoint>();
  const put = (d: Date, field: "sales" | "expenses", amount: number) => {
    let key: string;
    let label: string;
    if (hourly) {
      const dt = new Date(d);
      dt.setMinutes(0, 0, 0);
      key = `h${dt.getTime()}`;
      label = hourFmt.format(dt);
    } else {
      const dt = dayBounds(d).s;
      key = `d${ymd(dt)}`;
      label = monthFmt.format(dt);
    }
    const b = buckets.get(key) ?? { key, label, sales: 0, expenses: 0 };
    b[field] += amount;
    buckets.set(key, b);
  };

  if (!hourly) {
    for (let t = dayBounds(from).s.getTime(); t <= dayBounds(to).s.getTime(); t += 86400000) {
      put(new Date(t), "sales", 0);
    }
  } else {
    for (let i = 0; i < 24; i++) put(new Date(dayBounds(from).s.getTime() + i * 3600000), "sales", 0);
  }

  const [saleRows, expenseRows] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere(businessId, f, { statuses }),
      select: { createdAt: true, totalAmount: true },
    }),
    dayCount <= 92
      ? prisma.expense.findMany({
          where: { businessId, date: { gte: from, lte: to } },
          select: { date: true, amount: true },
        })
      : Promise.resolve([] as { date: Date; amount: Prisma.Decimal }[]),
  ]);
  for (const s of saleRows) put(s.createdAt, "sales", n(s.totalAmount));
  for (const e of expenseRows) put(e.date, "expenses", n(e.amount));

  return [...buckets.values()].map((b) => ({
    ...b,
    sales: Math.round(b.sales * 100) / 100,
    expenses: Math.round(b.expenses * 100) / 100,
  }));
}

/* ------------------------------------------------------------ filter menu */

export async function getReportFilterOptions(): Promise<ReportFilterOptions | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const [products, customers, locations, categories, staff, brandRows] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: bId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.customer.findMany({
      where: { businessId: bId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
    prisma.location.findMany({
      where: { businessId: bId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { businessId: bId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { businessId: bId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { businessId: bId, deletedAt: null, brand: { not: null } },
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    }),
  ]);
  return {
    products,
    customers,
    locations,
    categories,
    staff,
    brands: brandRows.map((b) => b.brand!).filter(Boolean),
  };
}

/* --------------------------------------------------------------- SALES tab */

export type SalesReportRow = {
  id: string;
  invoiceNo: string;
  createdAt: string;
  customerName: string | null;
  soldByName: string;
  locationName: string;
  itemsCount: number;
  totalAmount: string;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
};

export type SalesReport = {
  kpis: {
    total: string;
    count: number;
    avgTicket: string;
    refunds: number;
    refundAmount: string;
  };
  series: SeriesPoint[];
  paymentMethods: NamedBreakdown[];
  topStaff: NamedBreakdown[];
  rows: SalesReportRow[];
  generatedAt: string;
};

export async function getSalesReport(f: ReportFilters): Promise<SalesReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;

  const [completedAgg, refundedAgg, methodGroups, staffGroups, rows] = await Promise.all([
    prisma.sale.aggregate({
      where: saleWhere(bId, f, { statuses: ["COMPLETED"] }),
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.aggregate({
      where: saleWhere(bId, f, { statuses: ["REFUNDED"] }),
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: saleWhere(bId, f, { statuses: ["COMPLETED"] }),
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: "desc" } },
    }),
    prisma.sale.groupBy({
      by: ["soldById"],
      where: saleWhere(bId, f, { statuses: ["COMPLETED"] }),
      _sum: { totalAmount: true },
      _count: { _all: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 8,
    }),
    prisma.sale.findMany({
      where: saleWhere(bId, f),
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        invoiceNo: true,
        createdAt: true,
        itemsCount: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        status: true,
        customer: { select: { name: true } },
        soldBy: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
  ]);

  const staffIds = staffGroups.map((s) => s.soldById);
  const staffUsers = staffIds.length
    ? await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
    : [];
  const staffName = new Map(staffUsers.map((u) => [u.id, u.name]));

  const total = n(completedAgg._sum.totalAmount);
  const count = completedAgg._count._all;

  return {
    kpis: {
      total: money(total),
      count,
      avgTicket: money(count > 0 ? total / count : 0),
      refunds: refundedAgg._count._all,
      refundAmount: money(n(refundedAgg._sum.totalAmount)),
    },
    series: await buildSeries(bId, f, ["COMPLETED"]),
    paymentMethods: methodGroups.map((m) => ({
      name: m.paymentMethod,
      amount: n(m._sum.totalAmount),
      count: m._count._all,
    })),
    topStaff: staffGroups.map((s) => ({
      name: staffName.get(s.soldById) ?? "Unknown",
      amount: n(s._sum.totalAmount),
      count: s._count._all,
    })),
    rows: rows.map((r) => ({
      id: r.id,
      invoiceNo: r.invoiceNo,
      createdAt: r.createdAt.toISOString(),
      customerName: r.customer?.name ?? null,
      soldByName: r.soldBy.name,
      locationName: r.location.name,
      itemsCount: r.itemsCount,
      totalAmount: money(n(r.totalAmount)),
      paymentMethod: r.paymentMethod,
      paymentStatus: r.paymentStatus,
      status: r.status,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------ INVOICES tab */

export type InvoiceReportRow = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  customerName: string | null;
  status: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
};

export type InvoicesReport = {
  kpis: { total: string; paid: string; due: string; count: number };
  byStatus: NamedBreakdown[];
  rows: InvoiceReportRow[];
  generatedAt: string;
};

export async function getInvoicesReport(f: ReportFilters): Promise<InvoicesReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const { from, to } = resolveRange(f);

  const where: Prisma.InvoiceWhereInput = {
    businessId: bId,
    issueDate: { gte: from, lte: to },
    ...(f.customerId ? { customerId: f.customerId } : {}),
  };

  const [agg, statusGroups, rows] = await Promise.all([
    prisma.invoice.aggregate({ where, _sum: { totalAmount: true, amountPaid: true }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ["status"], where, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      take: 500,
      select: {
        id: true,
        number: true,
        issueDate: true,
        dueDate: true,
        status: true,
        totalAmount: true,
        amountPaid: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const total = n(agg._sum.totalAmount);
  const paid = n(agg._sum.amountPaid);

  return {
    kpis: { total: money(total), paid: money(paid), due: money(Math.max(0, total - paid)), count: agg._count._all },
    byStatus: statusGroups.map((s) => ({ name: s.status, amount: n(s._sum.totalAmount), count: s._count._all })),
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      issueDate: r.issueDate.toISOString(),
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      customerName: r.customer?.name ?? null,
      status: r.status,
      totalAmount: money(n(r.totalAmount)),
      amountPaid: money(n(r.amountPaid)),
      balance: money(Math.max(0, n(r.totalAmount) - n(r.amountPaid))),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------- STOCK tab */

export type StockReportRow = {
  id: string;
  productName: string;
  sku: string;
  category: string | null;
  brand: string | null;
  locationName: string;
  quantity: number;
  alertAt: number;
  costValue: string;
  retailValue: string;
  status: "NEGATIVE" | "OUT" | "LOW" | "OK";
};

export type StockReport = {
  kpis: { costValue: string; retailValue: string; units: number; negative: number; low: number };
  rows: StockReportRow[];
  generatedAt: string;
};

export async function getStockReport(f: ReportFilters): Promise<StockReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;

  const levels = await prisma.stockLevel.findMany({
    where: {
      location: { businessId: bId, ...(f.locationId ? { id: f.locationId } : {}) },
      product: productWhere(bId, f),
    },
    select: {
      id: true,
      quantity: true,
      product: {
        select: { name: true, sku: true, brand: true, costPrice: true, price: true, alertAt: true, category: { select: { name: true } } },
      },
      location: { select: { name: true } },
    },
    take: 2000,
  });

  let costValue = 0;
  let retailValue = 0;
  let units = 0;
  let negative = 0;
  let low = 0;
  const rows: StockReportRow[] = levels
    .map((l) => {
      const qty = l.quantity;
      const cost = n(l.product.costPrice);
      const price = n(l.product.price);
      const status: StockReportRow["status"] =
        qty < 0 ? "NEGATIVE" : qty === 0 ? "OUT" : qty <= l.product.alertAt ? "LOW" : "OK";
      costValue += cost * Math.max(0, qty);
      retailValue += price * Math.max(0, qty);
      units += qty;
      if (status === "NEGATIVE") negative++;
      if (status === "LOW" || status === "OUT") low++;
      return {
        id: l.id,
        productName: l.product.name,
        sku: l.product.sku,
        category: l.product.category?.name ?? null,
        brand: l.product.brand,
        locationName: l.location.name,
        quantity: qty,
        alertAt: l.product.alertAt,
        costValue: money(cost * qty),
        retailValue: money(price * qty),
        status,
      };
    })
    .sort((a, b) => {
      const rank = { NEGATIVE: 0, OUT: 1, LOW: 2, OK: 3 } as const;
      return rank[a.status] - rank[b.status] || a.quantity - b.quantity;
    });

  return {
    kpis: { costValue: money(costValue), retailValue: money(retailValue), units, negative, low },
    rows,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------------------------------------------------------- PURCHASES tab */

export type PurchaseReportRow = {
  id: string;
  referenceNo: string;
  date: string;
  supplierName: string | null;
  locationName: string;
  addedByName: string;
  status: string;
  paymentStatus: string;
  grandTotal: string;
};

export type PurchasesReport = {
  kpis: { total: string; count: number; pending: number; paid: string; due: string };
  bySupplier: NamedBreakdown[];
  rows: PurchaseReportRow[];
  generatedAt: string;
};

export async function getPurchasesReport(f: ReportFilters): Promise<PurchasesReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const { from, to } = resolveRange(f);

  const where: Prisma.PurchaseWhereInput = {
    businessId: bId,
    date: { gte: from, lte: to },
    ...(f.locationId ? { locationId: f.locationId } : {}),
    ...(f.productId ? { items: { some: { productId: f.productId } } } : {}),
    ...(f.categoryId ? { items: { some: { product: { categoryId: f.categoryId } } } } : {}),
    ...(f.brand ? { items: { some: { product: { brand: f.brand } } } } : {}),
  };

  const [agg, pendingAgg, supplierGroups, rows] = await Promise.all([
    prisma.purchase.aggregate({ where, _sum: { grandTotal: true }, _count: { _all: true } }),
    prisma.purchase.count({ where: { ...where, status: "PENDING" } }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { ...where, supplierId: { not: null } },
      _sum: { grandTotal: true },
      _count: { _all: true },
      orderBy: { _sum: { grandTotal: "desc" } },
      take: 8,
    }),
    prisma.purchase.findMany({
      where,
      orderBy: { date: "desc" },
      take: 500,
      select: {
        id: true,
        referenceNo: true,
        date: true,
        status: true,
        paymentStatus: true,
        grandTotal: true,
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        addedBy: { select: { name: true } },
      },
    }),
  ]);

  const supplierIds = supplierGroups.map((s) => s.supplierId!).filter(Boolean);
  const suppliers = supplierIds.length
    ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true } })
    : [];
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  const total = n(agg._sum.grandTotal);
  const paidAgg = await prisma.payment.aggregate({
    where: { purchase: { businessId: bId, date: { gte: from, lte: to } } },
    _sum: { amount: true },
  });
  const paid = n(paidAgg._sum.amount);

  return {
    kpis: { total: money(total), count: agg._count._all, pending: pendingAgg, paid: money(paid), due: money(Math.max(0, total - paid)) },
    bySupplier: supplierGroups.map((s) => ({
      name: supplierName.get(s.supplierId!) ?? "Unknown",
      amount: n(s._sum.grandTotal),
      count: s._count._all,
    })),
    rows: rows.map((r) => ({
      id: r.id,
      referenceNo: r.referenceNo,
      date: r.date.toISOString(),
      supplierName: r.supplier?.name ?? null,
      locationName: r.location.name,
      addedByName: r.addedBy.name,
      status: r.status,
      paymentStatus: r.paymentStatus,
      grandTotal: money(n(r.grandTotal)),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------- PROFIT / LOSS tab */

export type ProfitProductRow = {
  productId: string;
  name: string;
  category: string | null;
  qty: number;
  revenue: string;
  cogs: string;
  profit: string;
};

export type ProfitLossReport = {
  kpis: { revenue: string; cogs: string; grossProfit: string; expenses: string; netProfit: string; margin: number };
  series: SeriesPoint[];
  topProducts: ProfitProductRow[];
  generatedAt: string;
};

export async function getProfitLossReport(f: ReportFilters): Promise<ProfitLossReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const { from, to } = resolveRange(f);

  const [revenueAgg, expenseAgg, saleItems] = await Promise.all([
    prisma.sale.aggregate({
      where: saleWhere(bId, f, { statuses: ["COMPLETED"] }),
      _sum: { totalAmount: true },
    }),
    prisma.expense.aggregate({
      where: { businessId: bId, date: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.saleItem.findMany({
      where: {
        sale: saleWhere(bId, f, { statuses: ["COMPLETED"] }),
      },
      select: {
        qty: true,
        unitPrice: true,
        product: {
          select: {
            id: true,
            name: true,
            costPrice: true,
            category: { select: { name: true } },
          },
        },
      },
      take: 5000,
    }),
  ]);

  const revenue = n(revenueAgg._sum.totalAmount);
  const expenses = n(expenseAgg._sum.amount);

  let cogs = 0;
  const perProduct = new Map<string, ProfitProductRow>();
  for (const item of saleItems) {
    const cost = n(item.product.costPrice) * item.qty;
    const line = n(item.unitPrice) * item.qty;
    cogs += cost;
    const key = item.product.id;
    const row =
      perProduct.get(key) ??
      ({
        productId: key,
        name: item.product.name,
        category: item.product.category?.name ?? null,
        qty: 0,
        revenue: "0",
        cogs: "0",
        profit: "0",
      } satisfies ProfitProductRow);
    row.qty += item.qty;
    row.revenue = money(Number(row.revenue) + line);
    row.cogs = money(Number(row.cogs) + cost);
    row.profit = money(Number(row.revenue) - Number(row.cogs));
    perProduct.set(key, row);
  }

  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;

  return {
    kpis: {
      revenue: money(revenue),
      cogs: money(cogs),
      grossProfit: money(grossProfit),
      expenses: money(expenses),
      netProfit: money(netProfit),
      margin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
    },
    series: await buildSeries(bId, f, ["COMPLETED"]),
    topProducts: [...perProduct.values()]
      .sort((a, b) => Number(b.profit) - Number(a.profit))
      .slice(0, 15),
    generatedAt: new Date().toISOString(),
  };
}

/* --------------------------------------------------- EXPENSE & ACCOUNT tab */

export type ExpenseReportRow = {
  id: string;
  date: string;
  category: string;
  description: string | null;
  accountName: string | null;
  createdByName: string;
  amount: string;
};

export type AccountReportRow = {
  id: string;
  name: string;
  type: string;
  balance: string;
  inflow: string;
  outflow: string;
};

export type ExpensesReport = {
  kpis: { total: string; count: number; topCategory: string | null; netFlow: string };
  byCategory: NamedBreakdown[];
  rows: ExpenseReportRow[];
  accounts: AccountReportRow[];
  generatedAt: string;
};

export async function getExpensesReport(f: ReportFilters): Promise<ExpensesReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const { from, to } = resolveRange(f);

  const [agg, categoryGroups, rows, accounts, inflowGroups, outflowGroups] = await Promise.all([
    prisma.expense.aggregate({ where: { businessId: bId, date: { gte: from, lte: to } }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.expense.groupBy({
      by: ["category"],
      where: { businessId: bId, date: { gte: from, lte: to } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
    prisma.expense.findMany({
      where: { businessId: bId, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
      take: 500,
      select: {
        id: true,
        date: true,
        category: true,
        description: true,
        amount: true,
        account: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.bankAccount.findMany({
      where: { businessId: bId, isActive: true },
      select: { id: true, name: true, type: true, balance: true },
      orderBy: { name: "asc" },
    }),
    prisma.payment.groupBy({
      by: ["accountId"],
      where: { account: { businessId: bId }, createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.expense.groupBy({
      by: ["accountId"],
      where: { businessId: bId, date: { gte: from, lte: to }, accountId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const inflowByAccount = new Map(inflowGroups.filter((g) => g.accountId).map((g) => [g.accountId!, n(g._sum.amount)]));
  const outflowByAccount = new Map(outflowGroups.filter((g) => g.accountId).map((g) => [g.accountId!, n(g._sum.amount)]));
  const total = n(agg._sum.amount);
  const inflow = [...inflowByAccount.values()].reduce((s, v) => s + v, 0);

  return {
    kpis: {
      total: money(total),
      count: agg._count._all,
      topCategory: categoryGroups[0]?.category ?? null,
      netFlow: money(inflow - total),
    },
    byCategory: categoryGroups.map((c) => ({ name: c.category, amount: n(c._sum.amount), count: c._count._all })),
    rows: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      category: r.category,
      description: r.description,
      accountName: r.account?.name ?? null,
      createdByName: r.createdBy.name,
      amount: money(n(r.amount)),
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: money(n(a.balance)),
      inflow: money(inflowByAccount.get(a.id) ?? 0),
      outflow: money(outflowByAccount.get(a.id) ?? 0),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------ CONTACT/CRM */

export type CrmRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  orders: number;
  totalSpent: string;
  avgTicket: string;
  lastPurchase: string | null;
  creditDue: string;
};

export type CrmReport = {
  kpis: { totalCustomers: number; active: number; newCustomers: number; walkInShare: number };
  rows: CrmRow[];
  generatedAt: string;
};

export async function getCrmReport(f: ReportFilters): Promise<CrmReport | null> {
  const session = await requireBusiness();
  const bId = session.businessId;
  const { from, to } = resolveRange(f);

  const [totalCustomers, newCustomers, customers, salesIn] = await Promise.all([
    prisma.customer.count({ where: { businessId: bId, deletedAt: null } }),
    prisma.customer.count({ where: { businessId: bId, deletedAt: null, createdAt: { gte: from, lte: to } } }),
    prisma.customer.findMany({
      where: {
        businessId: bId,
        deletedAt: null,
        ...(f.customerId ? { id: f.customerId } : {}),
        ...(f.group ? { type: f.group as "WALK_IN" | "REGISTERED" } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        type: true,
        sales: {
          where: { status: { not: "CANCELLED" } },
          select: { totalAmount: true, createdAt: true },
        },
        invoices: {
          where: { status: { in: ["DRAFT", "ISSUED"] } },
          select: { totalAmount: true, amountPaid: true },
        },
      },
      take: 500,
    }),
    prisma.sale.aggregate({
      where: saleWhere(bId, f, { statuses: ["COMPLETED", "REFUNDED"] }),
      _count: { _all: true },
    }),
  ]);

  let active = 0;
  let completedSales = 0;
  const rows: CrmRow[] = customers
    .map((c) => {
      const inRange = c.sales.filter((s) => s.createdAt >= from && s.createdAt <= to);
      const spent = inRange.reduce((sum, s) => sum + n(s.totalAmount), 0);
      const creditDue = c.invoices.reduce(
        (sum, i) => sum + Math.max(0, n(i.totalAmount) - n(i.amountPaid)),
        0,
      );
      const last = c.sales
        .map((s) => s.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (inRange.length > 0) active++;
      completedSales += inRange.length;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        type: c.type,
        orders: inRange.length,
        totalSpent: money(spent),
        avgTicket: money(inRange.length > 0 ? spent / inRange.length : 0),
        lastPurchase: last ? last.toISOString() : null,
        creditDue: money(creditDue),
      };
    })
    .sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent));

  return {
    kpis: {
      totalCustomers,
      active,
      newCustomers,
      walkInShare:
        salesIn._count._all > 0
          ? Math.round(((salesIn._count._all - completedSales) / salesIn._count._all) * 1000) / 10
          : 0,
    },
    rows,
    generatedAt: new Date().toISOString(),
  };
}
