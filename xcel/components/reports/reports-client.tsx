"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import {
  getCrmReport,
  getExpensesReport,
  getInvoicesReport,
  getProfitLossReport,
  getPurchasesReport,
  getReportFilterOptions,
  getSalesReport,
  getStockReport,
  type CrmReport,
  type ExpensesReport,
  type InvoicesReport,
  type ProfitLossReport,
  type PurchasesReport,
  type ReportTab,
  type SalesReport,
} from "@/app/actions/reports";
import { ReportFilterPanel, defaultFilterState, type ReportFilterState } from "@/components/reports/report-filter-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv, printReport } from "@/lib/report-utils";
import { cn, formatCurrency as naira, formatCurrencyCompact as compact } from "@/lib/utils";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const methodLabel: Record<string, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
  SPLIT: "Split",
};

const TABS: { key: ReportTab; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "sales", label: "Sales" },
  { key: "stock", label: "Stock" },
  { key: "purchases", label: "Purchases" },
  { key: "profit", label: "Profit / Loss" },
  { key: "expenses", label: "Expense & Account" },
  { key: "crm", label: "Contact & CRM" },
];

type ReportData =
  | { tab: "sales"; data: SalesReport }
  | { tab: "invoices"; data: InvoicesReport }
  | { tab: "stock"; data: StockReportLike }
  | { tab: "purchases"; data: PurchasesReport }
  | { tab: "profit"; data: ProfitLossReport }
  | { tab: "expenses"; data: ExpensesReport }
  | { tab: "crm"; data: CrmReport };

// Structural subset to avoid importing a server-only type into the union awkwardly
type StockReportLike = {
  kpis: { costValue: string; retailValue: string; units: number; negative: number; low: number };
  rows: {
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
  }[];
  generatedAt: string;
};

export function ReportsClient({
  businessName,
  range,
}: {
  businessName: string;
  range: { from: string; to: string };
}) {
  const [tab, setTab] = useState<ReportTab>("sales");
  const [filterState, setFilterState] = useState<ReportFilterState>({
    ...defaultFilterState,
    range: { key: "30d", ...range },
  });
  const [applied, setApplied] = useState<ReportFilterState>({
    ...defaultFilterState,
    range: { key: "30d", ...range },
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getReportFilterOptions>>>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getReportFilterOptions().then(setOptions).catch(() => setOptions(null));
  }, []);

  // Only the newest request may write — tab/filter switches used to let a
  // slow old response overwrite the freshly selected report.
  const loadSeqRef = useRef(0);
  const load = useCallback(
    async (which: ReportTab, f: ReportFilterState) => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      const filters = {
        from: f.range.from,
        to: f.range.to,
        productId: f.productId !== "ALL" ? f.productId : undefined,
        customerId: f.customerId !== "ALL" ? f.customerId : undefined,
        locationId: f.locationId !== "ALL" ? f.locationId : undefined,
        categoryId: f.categoryId !== "ALL" ? f.categoryId : undefined,
        group: f.group !== "ALL" ? f.group : undefined,
        brand: f.brand !== "ALL" ? f.brand : undefined,
        paymentMethod: f.paymentMethod as never,
        soldById: f.soldById !== "ALL" ? f.soldById : undefined,
        timeFrom: f.timeFrom || undefined,
        timeTo: f.timeTo || undefined,
      };
      const stale = () => seq !== loadSeqRef.current;
      try {
        if (which === "sales") {
          const data = await getSalesReport(filters);
          if (data && !stale()) setReport({ tab: "sales", data });
        } else if (which === "invoices") {
          const data = await getInvoicesReport(filters);
          if (data && !stale()) setReport({ tab: "invoices", data });
        } else if (which === "stock") {
          const data = await getStockReport(filters);
          if (data && !stale()) setReport({ tab: "stock", data });
        } else if (which === "purchases") {
          const data = await getPurchasesReport(filters);
          if (data && !stale()) setReport({ tab: "purchases", data });
        } else if (which === "profit") {
          const data = await getProfitLossReport(filters);
          if (data && !stale()) setReport({ tab: "profit", data });
        } else if (which === "expenses") {
          const data = await getExpensesReport(filters);
          if (data && !stale()) setReport({ tab: "expenses", data });
        } else {
          const data = await getCrmReport(filters);
          if (data && !stale()) setReport({ tab: "crm", data });
        }
      } catch {
        if (!stale()) toast.error("Couldn't load the report", { description: "Please try again." });
      } finally {
        if (!stale()) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(tab, applied);
  }, [tab, applied, load]);

  const subtitle = `${businessName} · ${fmtDate(applied.range.from)} → ${fmtDate(applied.range.to)}`;

  return (
    <div className="space-y-6">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ReportTab)}
        className="gap-5"
      >
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <TabsList className="h-11 w-fit gap-1 rounded-full bg-secondary/70 p-1.5">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="h-8 rounded-full px-4 text-sm font-semibold transition-all duration-200 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ReportFilterPanel
          state={filterState}
          onChange={setFilterState}
          onApply={() => {
            if (!filterState.range.from || !filterState.range.to) {
              toast.error("Pick a date range first");
              return;
            }
            setApplied(filterState);
          }}
          onReset={() => {
            const reset = { ...defaultFilterState, range: applied.range };
            setFilterState(reset);
            setApplied(reset);
          }}
          options={options}
          busy={loading}
          visible={filtersOpen}
          onToggleVisible={() => setFiltersOpen((o) => !o)}
        />

        {loading && !report ? (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-2xl" />
          </div>
        ) : null}

        {/* ------------------------------------------------------ SALES */}
        <TabsContent value="sales" className="mt-0 space-y-4">
          {report?.tab === "sales" && (
            <SalesTab report={report.data} subtitle={subtitle} />
          )}
        </TabsContent>

        {/* --------------------------------------------------- INVOICES */}
        <TabsContent value="invoices" className="mt-0 space-y-4">
          {report?.tab === "invoices" && (
            <InvoicesTab report={report.data} subtitle={subtitle} />
          )}
        </TabsContent>

        {/* ------------------------------------------------------ STOCK */}
        <TabsContent value="stock" className="mt-0 space-y-4">
          {report?.tab === "stock" && <StockTab report={report.data} subtitle={subtitle} />}
        </TabsContent>

        {/* -------------------------------------------------- PURCHASES */}
        <TabsContent value="purchases" className="mt-0 space-y-4">
          {report?.tab === "purchases" && (
            <PurchasesTab report={report.data} subtitle={subtitle} />
          )}
        </TabsContent>

        {/* ----------------------------------------------------- PROFIT */}
        <TabsContent value="profit" className="mt-0 space-y-4">
          {report?.tab === "profit" && <ProfitTab report={report.data} subtitle={subtitle} />}
        </TabsContent>

        {/* --------------------------------------------------- EXPENSES */}
        <TabsContent value="expenses" className="mt-0 space-y-4">
          {report?.tab === "expenses" && (
            <ExpensesTab report={report.data} subtitle={subtitle} />
          )}
        </TabsContent>

        {/* -------------------------------------------------------- CRM */}
        <TabsContent value="crm" className="mt-0 space-y-4">
          {report?.tab === "crm" && <CrmTab report={report.data} subtitle={subtitle} />}
        </TabsContent>
      </Tabs>

      {loading && report ? (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-transform duration-500" />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- chart */

type TooltipPayload = {
  payload?: { label?: string; sales: number; expenses: number };
};

function ReportTooltip({
  active,
  payload,
  label,
  showExpenses = true,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  showExpenses?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2 shadow-card-lg">
      <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">{row?.label ?? label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">
        Sales {compact(row?.sales ?? 0)}
      </p>
      {showExpenses ? (
        <p className="text-sm font-semibold tabular-nums text-danger">
          Expenses {compact(row?.expenses ?? 0)}
        </p>
      ) : null}
    </div>
  );
}

function TrendChart({ data }: { data: { label: string; key: string; sales: number; expenses: number }[] }) {
  if (data.length === 0) return null;
  const hasExpense = data.some((d) => d.expenses > 0);
  return (
    <div className="h-[280px] w-full animate-in fade-in duration-300">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="repSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="repExpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-soft)" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fontSize: 11, fill: "var(--muted-soft)" }}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip cursor={{ stroke: "var(--border)" }} content={<ReportTooltip showExpenses={hasExpense} />} />
          <Area
            type="monotone"
            dataKey="sales"
            name="Sales"
            stroke="var(--chart-1)"
            strokeWidth={2.25}
            fill="url(#repSalesFill)"
            animationDuration={450}
          />
          {hasExpense ? (
            <Area
              type="monotone"
              dataKey="expenses"
              name="Expenses"
              stroke="var(--chart-3)"
              strokeWidth={1.75}
              strokeDasharray="4 3"
              fill="url(#repExpFill)"
              animationDuration={450}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------- shared bits */

function CardShell({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-premium overflow-hidden", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h3 className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">{title}</h3>
          {description ? <p className="text-sm leading-normal text-slate-500 dark:text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExportButtons({
  onCsv,
  onPrint,
  disabled,
}: {
  onCsv: () => void;
  onPrint: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onCsv} disabled={disabled}>
        <Download className="size-4" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={onPrint} disabled={disabled}>
        <Printer className="size-4" />
        Print
      </Button>
    </div>
  );
}

type HeaderSpec = string | { label: string; align?: "right" };

function DataTable({
  headers,
  children,
}: {
  headers: HeaderSpec[];
  children: React.ReactNode;
}) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => {
              const label = typeof h === "string" ? h : h.label;
              const align = typeof h === "string" ? undefined : h.align;
              return (
                <TableHead
                  key={label}
                  className={cn(
                    "whitespace-nowrap",
                    i === 0 && "pl-5",
                    align === "right" && "text-right",
                  )}
                >
                  {label}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

const moneyCell = "text-right font-semibold tabular-nums";

function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "warning" | "destructive" | "info" | "secondary" | "outline"; label: string }> = {
    COMPLETED: { variant: "default", label: "Completed" },
    REFUNDED: { variant: "destructive", label: "Refunded" },
    CANCELLED: { variant: "outline", label: "Cancelled" },
    PAID: { variant: "default", label: "Paid" },
    PARTIAL: { variant: "warning", label: "Partial" },
    UNPAID: { variant: "destructive", label: "Unpaid" },
    DRAFT: { variant: "outline", label: "Draft" },
    ISSUED: { variant: "info", label: "Issued" },
    RECEIVED: { variant: "default", label: "Received" },
    PENDING: { variant: "warning", label: "Pending" },
    OK: { variant: "default", label: "OK" },
    LOW: { variant: "warning", label: "Low" },
    OUT: { variant: "destructive", label: "Out" },
    NEGATIVE: { variant: "destructive", label: "Negative" },
  };
  const meta = map[status];
  return <Badge variant={meta?.variant ?? "outline"}>{meta?.label ?? status}</Badge>;
}

function breakdownCsv(
  title: string,
  rows: { name: string; amount: number; count: number }[],
) {
  return rows.map((r) => [title, r.name, r.count, r.amount.toFixed(2)]);
}

/* ------------------------------------------------------------- SALES */

function SalesTab({ report, subtitle }: { report: SalesReport; subtitle: string }) {
  const { kpis, series, paymentMethods, topStaff, rows } = report;
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => setPage(1), [rows]);

  const maxMethod = Math.max(1, ...paymentMethods.map((m) => m.amount));

  const exportCsv = () =>
    downloadCsv(
      "sales-report",
      ["Section", "Invoice", "Date", "Customer", "Sold by", "Location", "Items", "Total", "Method", "Payment", "Status"],
      [
        ...breakdownCsv("Payment method", paymentMethods),
        ...topStaff.map((s) => ["Top staff", s.name, s.count, s.amount.toFixed(2)]),
        ...rows.map((r) => [
          "Sale",
          r.invoiceNo,
          fmtDateTime(r.createdAt),
          r.customerName ?? "Walk-in",
          r.soldByName,
          r.locationName,
          r.itemsCount,
          r.totalAmount,
          methodLabel[r.paymentMethod] ?? r.paymentMethod,
          r.paymentStatus,
          r.status,
        ]),
      ],
    );

  const print = () =>
    printReport({
      title: "Sales report",
      subtitle,
      kpis: [
        { label: "Sales total", value: naira(kpis.total) },
        { label: "Sale count", value: String(kpis.count) },
        { label: "Avg ticket", value: naira(kpis.avgTicket) },
        { label: "Refunds", value: `${kpis.refunds} · ${naira(kpis.refundAmount)}` },
      ],
      columns: ["Invoice", "Date", "Customer", "Sold by", "Location", "Items", "Total", "Method", "Payment", "Status"],
      rows: rows.map((r) => [
        r.invoiceNo,
        fmtDateTime(r.createdAt),
        r.customerName ?? "Walk-in",
        r.soldByName,
        r.locationName,
        r.itemsCount,
        naira(r.totalAmount),
        methodLabel[r.paymentMethod] ?? r.paymentMethod,
        r.paymentStatus,
        r.status,
      ]),
      numericFrom: 5,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Sales total" value={naira(kpis.total)} supporting={`${kpis.count} completed sales`} tone="success" icon={ArrowUpRight} />
        <KpiCard label="Sale count" value={String(kpis.count)} supporting="Tickets in range" tone="info" />
        <KpiCard label="Avg ticket" value={naira(kpis.avgTicket)} supporting="Per completed sale" />
        <KpiCard
          label="Refunds"
          value={naira(kpis.refundAmount)}
          supporting={`${kpis.refunds} refund${kpis.refunds === 1 ? "" : "s"}`}
          tone={kpis.refunds > 0 ? "danger" : "default"}
          icon={ArrowDownRight}
        />
      </div>

      <CardShell title="Sales trend" description="Revenue vs expenses over the range">
        <div className="px-5 py-4">
          <TrendChart data={series} />
        </div>
      </CardShell>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardShell title="Payment methods" description="Revenue share by method">
          <div className="grid gap-4 p-5">
            {paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales in this range.</p>
            ) : (
              paymentMethods.map((m) => (
                <div key={m.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{methodLabel[m.name] ?? m.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {naira(m.amount)} · {m.count}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--chart-1)] transition-all duration-500"
                      style={{ width: `${Math.round((m.amount / maxMethod) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </CardShell>

        <CardShell title="Top staff" description="By completed sales revenue">
          <DataTable headers={["Staff", { label: "Sales", align: "right" }, { label: "Revenue", align: "right" }]}>
            {topStaff.map((s, i) => (
              <TableRow key={s.name}>
                <TableCell className="pl-5 font-medium">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="grid size-6 place-items-center rounded-full bg-soft-green text-xs font-bold tabular-nums text-primary">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-foreground">{s.name}</span>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{s.count}</TableCell>
                <TableCell className={moneyCell}>{naira(s.amount)}</TableCell>
              </TableRow>
            ))}
            {topStaff.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No sales in this range.
                </TableCell>
              </TableRow>
            )}
          </DataTable>
        </CardShell>
      </div>

      <CardShell
        title="Detailed sales"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"} - 25 per page`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable
          headers={["Invoice", "Date", "Customer", "Sold by", "Location", { label: "Items", align: "right" }, { label: "Total", align: "right" }, "Method", "Payment", "Status"]}
        >
          {visibleRows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="px-4 text-sm font-semibold tracking-tight">{r.invoiceNo}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDateTime(r.createdAt)}</TableCell>
              <TableCell className="max-w-40 truncate">{r.customerName ?? "Walk-in"}</TableCell>
              <TableCell className="text-muted-foreground">{r.soldByName}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{r.locationName}</TableCell>
              <TableCell className="text-right tabular-nums">{r.itemsCount}</TableCell>
              <TableCell className={moneyCell}>{naira(r.totalAmount)}</TableCell>
              <TableCell>{methodLabel[r.paymentMethod] ?? r.paymentMethod}</TableCell>
              <TableCell>{statusBadge(r.paymentStatus)}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                No sales match the selected filters.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
        {rows.length > 0 && (
          <TablePagination
            page={safePage}
            pageCount={pageCount}
            total={rows.length}
            pageSize={pageSize}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
          />
        )}
      </CardShell>
    </div>
  );
}

/* ---------------------------------------------------------- INVOICES */

function InvoicesTab({ report, subtitle }: { report: InvoicesReport; subtitle: string }) {
  const { kpis, byStatus, rows } = report;

  const exportCsv = () =>
    downloadCsv(
      "invoices-report",
      ["Section", "Number", "Issue date", "Due date", "Customer", "Status", "Total", "Paid", "Balance"],
      [
        ...breakdownCsv("By status", byStatus),
        ...rows.map((r) => [
          "Invoice",
          r.number,
          fmtDate(r.issueDate),
          r.dueDate ? fmtDate(r.dueDate) : "",
          r.customerName ?? "",
          r.status,
          r.totalAmount,
          r.amountPaid,
          r.balance,
        ]),
      ],
    );

  const print = () =>
    printReport({
      title: "Invoices report",
      subtitle,
      kpis: [
        { label: "Total invoiced", value: naira(kpis.total) },
        { label: "Collected", value: naira(kpis.paid) },
        { label: "Outstanding", value: naira(kpis.due) },
        { label: "Invoices", value: String(kpis.count) },
      ],
      columns: ["Number", "Issue date", "Due date", "Customer", "Status", "Total", "Paid", "Balance"],
      rows: rows.map((r) => [
        r.number,
        fmtDate(r.issueDate),
        r.dueDate ? fmtDate(r.dueDate) : "—",
        r.customerName ?? "—",
        r.status,
        naira(r.totalAmount),
        naira(r.amountPaid),
        naira(r.balance),
      ]),
      numericFrom: 5,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total invoiced" value={naira(kpis.total)} supporting={`${kpis.count} invoices`} />
        <KpiCard label="Collected" value={naira(kpis.paid)} tone="success" />
        <KpiCard label="Outstanding" value={naira(kpis.due)} tone={Number(kpis.due) > 0 ? "warning" : "default"} />
        <KpiCard label="Status split" value={String(byStatus.length)} supporting="Distinct statuses in range" tone="info" />
      </div>

      <CardShell
        title="Invoices"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"} (latest 500)`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable headers={["Number", "Issue date", "Due date", "Customer", "Status", { label: "Total", align: "right" }, { label: "Paid", align: "right" }, { label: "Balance", align: "right" }]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="px-4 text-sm font-semibold tracking-tight">{r.number}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.issueDate)}</TableCell>
              <TableCell className="text-muted-foreground">{r.dueDate ? fmtDate(r.dueDate) : "—"}</TableCell>
              <TableCell className="max-w-40 truncate">{r.customerName ?? "Walk-in"}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className={moneyCell}>{naira(r.totalAmount)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{naira(r.amountPaid)}</TableCell>
              <TableCell className={cn(moneyCell, Number(r.balance) > 0 && "text-warning")}>
                {naira(r.balance)}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                No invoices match the selected filters.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </CardShell>
    </div>
  );
}

/* ------------------------------------------------------------ STOCK */

function StockTab({ report, subtitle }: { report: StockReportLike; subtitle: string }) {
  const { kpis, rows } = report;

  const exportCsv = () =>
    downloadCsv(
      "stock-report",
      ["Product", "SKU", "Category", "Brand", "Location", "Qty", "Alert at", "Cost value", "Retail value", "Status"],
      rows.map((r) => [
        r.productName,
        r.sku,
        r.category ?? "",
        r.brand ?? "",
        r.locationName,
        r.quantity,
        r.alertAt,
        r.costValue,
        r.retailValue,
        r.status,
      ]),
    );

  const print = () =>
    printReport({
      title: "Stock report",
      subtitle,
      kpis: [
        { label: "Cost value", value: naira(kpis.costValue) },
        { label: "Retail value", value: naira(kpis.retailValue) },
        { label: "Units on hand", value: String(kpis.units) },
        { label: "Negative / low", value: `${kpis.negative} / ${kpis.low}` },
      ],
      columns: ["Product", "SKU", "Category", "Brand", "Location", "Qty", "Alert at", "Cost value", "Retail value", "Status"],
      rows: rows.map((r) => [
        r.productName,
        r.sku,
        r.category ?? "—",
        r.brand ?? "—",
        r.locationName,
        r.quantity,
        r.alertAt,
        naira(r.costValue),
        naira(r.retailValue),
        r.status,
      ]),
      numericFrom: 5,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Cost value" value={naira(kpis.costValue)} supporting="At cost price" />
        <KpiCard label="Retail value" value={naira(kpis.retailValue)} supporting="At selling price" tone="success" />
        <KpiCard label="Units on hand" value={String(kpis.units)} tone="info" />
        <KpiCard
          label="Negative / low"
          value={`${kpis.negative} / ${kpis.low}`}
          supporting="Items needing attention"
          tone={kpis.negative > 0 ? "danger" : kpis.low > 0 ? "warning" : "default"}
        />
      </div>

      <CardShell
        title="Stock by product & location"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"}`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable headers={["Product", "SKU", "Category", "Brand", "Location", { label: "Qty", align: "right" }, { label: "Alert at", align: "right" }, { label: "Cost value", align: "right" }, { label: "Retail value", align: "right" }, "Status"]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-5 max-w-48 truncate font-semibold">{r.productName}</TableCell>
              <TableCell className="font-mono text-xs text-slate-500 dark:text-muted-foreground">{r.sku}</TableCell>
              <TableCell className="text-muted-foreground">{r.category ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{r.brand ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.locationName}</TableCell>
              <TableCell className={cn("text-right font-bold tabular-nums", r.quantity < 0 && "text-danger")}>
                {r.quantity}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{r.alertAt}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{naira(r.costValue)}</TableCell>
              <TableCell className={moneyCell}>{naira(r.retailValue)}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">
                No stock records match the selected filters.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </CardShell>
    </div>
  );
}

/* --------------------------------------------------------- PURCHASES */

function PurchasesTab({ report, subtitle }: { report: PurchasesReport; subtitle: string }) {
  const { kpis, bySupplier, rows } = report;
  const maxSupplier = Math.max(1, ...bySupplier.map((s) => s.amount));

  const exportCsv = () =>
    downloadCsv(
      "purchases-report",
      ["Section", "Reference", "Date", "Supplier", "Location", "Added by", "Status", "Payment", "Total"],
      [
        ...breakdownCsv("By supplier", bySupplier),
        ...rows.map((r) => [
          "Purchase",
          r.referenceNo,
          fmtDate(r.date),
          r.supplierName ?? "",
          r.locationName,
          r.addedByName,
          r.status,
          r.paymentStatus,
          r.grandTotal,
        ]),
      ],
    );

  const print = () =>
    printReport({
      title: "Purchases report",
      subtitle,
      kpis: [
        { label: "Total purchased", value: naira(kpis.total) },
        { label: "Orders", value: String(kpis.count) },
        { label: "Paid", value: naira(kpis.paid) },
        { label: "Due", value: naira(kpis.due) },
      ],
      columns: ["Reference", "Date", "Supplier", "Location", "Added by", "Status", "Payment", "Total"],
      rows: rows.map((r) => [
        r.referenceNo,
        fmtDate(r.date),
        r.supplierName ?? "—",
        r.locationName,
        r.addedByName,
        r.status,
        r.paymentStatus,
        naira(r.grandTotal),
      ]),
      numericFrom: 7,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total purchased" value={naira(kpis.total)} supporting={`${kpis.count} purchase orders`} />
        <KpiCard label="Paid" value={naira(kpis.paid)} tone="success" />
        <KpiCard label="Outstanding" value={naira(kpis.due)} tone={Number(kpis.due) > 0 ? "warning" : "default"} />
        <KpiCard label="Pending delivery" value={String(kpis.pending)} tone="info" />
      </div>

      {bySupplier.length > 0 && (
        <CardShell title="Top suppliers" description="By purchase value">
          <div className="grid gap-4 p-5">
            {bySupplier.map((s) => (
              <div key={s.name}>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {naira(s.amount)} · {s.count}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--chart-4)] transition-all duration-500"
                    style={{ width: `${Math.round((s.amount / maxSupplier) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardShell>
      )}

      <CardShell
        title="Purchases"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"} (latest 500)`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable headers={["Reference", "Date", "Supplier", "Location", "Added by", "Status", "Payment", { label: "Total", align: "right" }]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="px-4 text-sm font-semibold tracking-tight">{r.referenceNo}</TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(r.date)}</TableCell>
              <TableCell className="max-w-40 truncate">{r.supplierName ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{r.locationName}</TableCell>
              <TableCell className="text-muted-foreground">{r.addedByName}</TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell>{statusBadge(r.paymentStatus)}</TableCell>
              <TableCell className={moneyCell}>{naira(r.grandTotal)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                No purchases match the selected filters.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </CardShell>
    </div>
  );
}

/* ------------------------------------------------------------ PROFIT */

function ProfitTab({ report, subtitle }: { report: ProfitLossReport; subtitle: string }) {
  const { kpis, series, topProducts } = report;
  const maxRevenue = Math.max(1, ...topProducts.map((p) => Number(p.revenue)));

  const exportCsv = () =>
    downloadCsv(
      "profit-loss",
      ["Section", "Item", "Qty", "Revenue", "COGS", "Profit"],
      [
        ["KPI", "Revenue", "", kpis.revenue, "", ""],
        ["KPI", "Cost of goods sold", "", kpis.cogs, "", ""],
        ["KPI", "Gross profit", "", kpis.grossProfit, "", ""],
        ["KPI", "Operating expenses", "", kpis.expenses, "", ""],
        ["KPI", "Net profit", "", kpis.netProfit, "", ""],
        ["KPI", "Net margin", `${kpis.margin}%`, "", "", ""],
        ...topProducts.map((p) => ["Product", p.name, p.qty, p.revenue, p.cogs, p.profit]),
      ],
    );

  const print = () =>
    printReport({
      title: "Profit & loss",
      subtitle,
      kpis: [
        { label: "Revenue", value: naira(kpis.revenue) },
        { label: "Gross profit", value: naira(kpis.grossProfit) },
        { label: "Expenses", value: naira(kpis.expenses) },
        { label: "Net profit", value: `${naira(kpis.netProfit)} · ${kpis.margin}%` },
      ],
      columns: ["Product", "Category", "Qty", "Revenue", "COGS", "Profit"],
      rows: topProducts.map((p) => [
        p.name,
        p.category ?? "—",
        p.qty,
        naira(p.revenue),
        naira(p.cogs),
        naira(p.profit),
      ]),
      numericFrom: 2,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Revenue" value={naira(kpis.revenue)} tone="info" />
        <KpiCard label="Cost of goods" value={naira(kpis.cogs)} />
        <KpiCard label="Gross profit" value={naira(kpis.grossProfit)} tone="success" />
        <KpiCard label="Operating expenses" value={naira(kpis.expenses)} tone="warning" />
        <KpiCard
          label="Net profit"
          value={naira(kpis.netProfit)}
          supporting={`${kpis.margin}% margin`}
          tone={Number(kpis.netProfit) >= 0 ? "success" : "danger"}
        />
      </div>

      <CardShell title="Revenue vs expenses" description="Trend across the range">
        <div className="px-5 py-4">
          <TrendChart data={series} />
        </div>
      </CardShell>

      <CardShell
        title="Top products by profit"
        description="Revenue − cost of goods, per completed sale item"
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable headers={["#", "Product", "Category", { label: "Qty", align: "right" }, { label: "Revenue", align: "right" }, { label: "COGS", align: "right" }, { label: "Profit", align: "right" }]}>
          {topProducts.map((p, i) => (
            <TableRow key={p.productId}>
              <TableCell className="pl-5 text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="max-w-48 truncate font-semibold">{p.name}</TableCell>
              <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{p.qty}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{naira(p.revenue)}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{naira(p.cogs)}</TableCell>
              <TableCell className={cn(moneyCell, Number(p.profit) < 0 && "text-danger")}>{naira(p.profit)}</TableCell>
            </TableRow>
          ))}
          {topProducts.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                No completed sales in this range.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
        {topProducts.length > 0 && (
          <div className="border-t border-border/60 px-5 py-4">
            <div className="grid gap-3">
              {topProducts.slice(0, 5).map((p) => (
                <div key={p.productId}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="tabular-nums text-muted-foreground">{naira(p.revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--chart-2)] transition-all duration-500"
                      style={{ width: `${Math.round((Number(p.revenue) / maxRevenue) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardShell>
    </div>
  );
}

/* ---------------------------------------------------------- EXPENSES */

function ExpensesTab({ report, subtitle }: { report: ExpensesReport; subtitle: string }) {
  const { kpis, byCategory, rows, accounts } = report;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.amount));

  const exportCsv = () =>
    downloadCsv(
      "expenses-accounts",
      ["Section", "Item", "Detail", "Amount"],
      [
        ...breakdownCsv("By category", byCategory),
        ...rows.map((r) => ["Expense", r.category, `${fmtDate(r.date)} · ${r.description ?? ""}`, r.amount]),
        ...accounts.map((a) => [
          "Account",
          a.name,
          `${a.type} · balance`,
          a.balance,
        ]),
      ],
    );

  const print = () =>
    printReport({
      title: "Expense & account report",
      subtitle,
      kpis: [
        { label: "Total expenses", value: naira(kpis.total) },
        { label: "Entries", value: String(kpis.count) },
        { label: "Top category", value: kpis.topCategory ?? "—" },
        { label: "Net flow", value: naira(kpis.netFlow) },
      ],
      columns: ["Date", "Category", "Description", "Account", "By", "Amount"],
      rows: rows.map((r) => [
        fmtDate(r.date),
        r.category,
        r.description ?? "—",
        r.accountName ?? "—",
        r.createdByName,
        naira(r.amount),
      ]),
      numericFrom: 5,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total expenses" value={naira(kpis.total)} supporting={`${kpis.count} entries`} tone="danger" />
        <KpiCard label="Top category" value={kpis.topCategory ?? "—"} supporting="Largest spend area" tone="warning" />
        <KpiCard label="Net cash flow" value={naira(kpis.netFlow)} supporting="Inflows − expenses" tone={Number(kpis.netFlow) >= 0 ? "success" : "danger"} />
        <KpiCard label="Accounts" value={String(accounts.length)} supporting="Active bank / cash accounts" tone="info" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {byCategory.length > 0 && (
          <CardShell title="Expenses by category" description="Where the money went">
            <div className="grid gap-4 p-5">
              {byCategory.map((c) => (
                <div key={c.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-semibold">{c.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {naira(c.amount)} · {c.count}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--chart-3)] transition-all duration-500"
                      style={{ width: `${Math.round((c.amount / maxCat) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardShell>
        )}

        <CardShell title="Accounts" description="Balances and range flow">
          <DataTable headers={["Account", "Type", { label: "Inflow", align: "right" }, { label: "Outflow", align: "right" }, { label: "Balance", align: "right" }]}>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="pl-5 font-semibold">{a.name}</TableCell>
                <TableCell className="text-muted-foreground">{a.type}</TableCell>
                <TableCell className="text-right tabular-nums text-primary">{naira(a.inflow)}</TableCell>
                <TableCell className="text-right tabular-nums text-danger">{naira(a.outflow)}</TableCell>
                <TableCell className={moneyCell}>{naira(a.balance)}</TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No active accounts.
                </TableCell>
              </TableRow>
            )}
          </DataTable>
        </CardShell>
      </div>

      <CardShell
        title="Expense entries"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"} (latest 500)`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        <DataTable headers={["Date", "Category", "Description", "Account", "By", { label: "Amount", align: "right" }]}>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-5 text-muted-foreground">{fmtDate(r.date)}</TableCell>
              <TableCell className="font-semibold">{r.category}</TableCell>
              <TableCell className="max-w-56 truncate text-muted-foreground">{r.description ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.accountName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.createdByName}</TableCell>
              <TableCell className={cn(moneyCell, "text-danger")}>{naira(r.amount)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                No expenses recorded in this range.
              </TableCell>
            </TableRow>
          )}
        </DataTable>
      </CardShell>
    </div>
  );
}

/* --------------------------------------------------------------- CRM */

function CrmTab({ report, subtitle }: { report: CrmReport; subtitle: string }) {
  const { kpis, rows } = report;

  const exportCsv = () =>
    downloadCsv(
      "crm-report",
      ["Name", "Phone", "Email", "Group", "Orders", "Total spent", "Avg ticket", "Last purchase", "Credit due"],
      rows.map((r) => [
        r.name,
        r.phone ?? "",
        r.email ?? "",
        r.type,
        r.orders,
        r.totalSpent,
        r.avgTicket,
        r.lastPurchase ? fmtDate(r.lastPurchase) : "",
        r.creditDue,
      ]),
    );

  const print = () =>
    printReport({
      title: "Contact & CRM report",
      subtitle,
      kpis: [
        { label: "Customers", value: String(kpis.totalCustomers) },
        { label: "Active in range", value: String(kpis.active) },
        { label: "New in range", value: String(kpis.newCustomers) },
        { label: "Walk-in share", value: `${kpis.walkInShare}%` },
      ],
      columns: ["Name", "Phone", "Email", "Group", "Orders", "Total spent", "Avg ticket", "Last purchase", "Credit due"],
      rows: rows.map((r) => [
        r.name,
        r.phone ?? "—",
        r.email ?? "—",
        r.type === "WALK_IN" ? "Walk-in" : "Registered",
        r.orders,
        naira(r.totalSpent),
        naira(r.avgTicket),
        r.lastPurchase ? fmtDate(r.lastPurchase) : "—",
        naira(r.creditDue),
      ]),
      numericFrom: 4,
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total customers" value={String(kpis.totalCustomers)} />
        <KpiCard label="Active in range" value={String(kpis.active)} supporting="Bought at least once" tone="success" />
        <KpiCard label="New in range" value={String(kpis.newCustomers)} tone="info" />
        <KpiCard label="Walk-in share" value={`${kpis.walkInShare}%`} supporting="Of sales tickets" tone="warning" />
      </div>

      <CardShell
        title="Customers"
        description={`${rows.length} record${rows.length === 1 ? "" : "s"} · ranked by spend`}
        action={<ExportButtons onCsv={exportCsv} onPrint={print} />}
      >
        {rows.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Registered customers and walk-in activity will show up here."
            className="py-12"
          />
        ) : (
          <DataTable headers={["Customer", "Phone", "Group", { label: "Orders", align: "right" }, { label: "Total spent", align: "right" }, { label: "Avg ticket", align: "right" }, "Last purchase", { label: "Credit due", align: "right" }]}>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="pl-5">
                  <span className="grid">
                    <span className="max-w-44 truncate font-semibold">{r.name}</span>
                    {r.email ? (
                      <span className="max-w-44 truncate text-xs text-slate-500 dark:text-muted-foreground">{r.email}</span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.type === "WALK_IN" ? "secondary" : "info"}>
                    {r.type === "WALK_IN" ? "Walk-in" : "Registered"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
                <TableCell className={moneyCell}>{naira(r.totalSpent)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{naira(r.avgTicket)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.lastPurchase ? fmtDate(r.lastPurchase) : "—"}
                </TableCell>
                <TableCell className={cn(moneyCell, Number(r.creditDue) > 0 && "text-warning")}>
                  {naira(r.creditDue)}
                </TableCell>
              </TableRow>
            ))}
          </DataTable>
        )}
      </CardShell>
    </div>
  );
}
