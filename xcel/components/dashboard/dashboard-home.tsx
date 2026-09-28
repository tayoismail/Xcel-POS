"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  Crown,
  Receipt,
  ReceiptText,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  getDashboardStats,
  type DashboardStats,
} from "@/app/actions/dashboard";
import type { Role } from "@/lib/auth";
import {
  DateRangePicker,
  LiveBadge,
  todayRange,
  type DateRangeValue,
} from "@/components/dashboard/date-range-picker";
import { DebtorsCard } from "@/components/dashboard/debtors-table";
import { LatestSalesCard } from "@/components/dashboard/latest-sales-card";
import { SalesPerformanceChart } from "@/components/dashboard/sales-performance-chart";
import { StockAlertsCard } from "@/components/dashboard/stock-alerts-card";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency as naira, formatCurrencyCompact as compactNaira } from "@/lib/utils";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const roleLabel: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  STAFF: "Staff",
};

const roleTone: Record<Role, "default" | "info" | "secondary"> = {
  OWNER: "default",
  MANAGER: "info",
  STAFF: "secondary",
};

export function DashboardHome({
  businessId,
  role,
  userName,
  businessName,
  initialStats,
}: {
  businessId: string;
  role: Role;
  userName: string;
  businessName: string;
  initialStats: DashboardStats | null;
}) {
  const [stats, setStats] = useState<DashboardStats | null>(initialStats);
  const [range, setRange] = useState<DateRangeValue>(todayRange);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(initialStats?.updatedAt ?? null);

  const rangeRef = useRef(range);
  rangeRef.current = range;
  const loadingRef = useRef(false);

  const load = useCallback(async (r: DateRangeValue, opts?: { silent?: boolean }) => {
    if (loadingRef.current && !opts?.silent) return;
    loadingRef.current = true;
    if (!opts?.silent) setLoading(true);
    try {
      const next = await getDashboardStats({ from: r.from, to: r.to });
      if (next) {
        setStats(next);
        setUpdatedAt(next.updatedAt);
        setPulse(true);
        window.setTimeout(() => setPulse(false), 450);
      }
    } catch {
      toast.error("Couldn't refresh dashboard");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Reload when the range changes. The server already rendered today's
  // stats (initialStats), so skip the very first run to avoid a double fetch.
  const firstRangeRun = useRef(true);
  useEffect(() => {
    if (firstRangeRun.current) {
      firstRangeRun.current = false;
      return;
    }
    void load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, range.key]);

  // Keep latest range for realtime handler
  const loadRef = useRef(load);
  loadRef.current = load;

  // ------------------------------------------------ Supabase Realtime
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
    } catch {
      setLive(false);
      return;
    }

    const channel = supabase.channel(`dashboard-${businessId}`);
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void loadRef.current(rangeRef.current, { silent: true });
      }, 600);
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "Sale",
        filter: `businessId=eq.${businessId}`,
      },
      onChange,
    );
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "Payment" },
      onChange,
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "Invoice",
        filter: `businessId=eq.${businessId}`,
      },
      onChange,
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "Expense",
        filter: `businessId=eq.${businessId}`,
      },
      onChange,
    );
    // StockLevel has no businessId column — listen globally, debounce hard
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "StockLevel" },
      onChange,
    );

    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      setLive(false);
      void supabase?.removeChannel(channel);
    };
  }, [businessId]);

  const s = stats;
  const rangeLabel =
    s && s.range.from === s.range.to
      ? "Today"
      : s
        ? `${s.range.from} → ${s.range.to}`
        : "";

  const maxExpense = Math.max(
    1,
    ...(s?.expenseCategories ?? []).map((c) => Number(c.amount)),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${businessName} · live performance at a glance.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/dashboard/products">
                View products
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/pos">
                New sale
                <Receipt className="size-4" />
              </Link>
            </Button>
          </>
        }
      />

      {/* Range + live controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} onChange={setRange} busy={loading} />
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-muted-soft">
            {updatedAt
              ? `Updated ${formatTime(updatedAt)}`
              : "—"}
          </span>
          <LiveBadge live={live} busy={loading} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total sales"
          value={s ? compactNaira(s.totalSales) : "—"}
          supporting={rangeLabel ? `${rangeLabel} · completed` : undefined}
          icon={TrendingUp}
          tone="success"
          live={live}
          pulse={pulse}
          trend={
            s?.salesTrendPct != null
              ? `${s.salesTrendPct > 0 ? "+" : ""}${s.salesTrendPct}% vs prev`
              : undefined
          }
          trendDirection={
            s?.salesTrendPct != null && s.salesTrendPct < 0 ? "down" : "up"
          }
        />
        <KpiCard
          label="Invoice due"
          value={s ? compactNaira(s.invoiceDue) : "—"}
          supporting={
            s
              ? `${s.debtorsCount} open invoice${s.debtorsCount === 1 ? "" : "s"}`
              : undefined
          }
          icon={ReceiptText}
          tone={s && Number(s.invoiceDue) > 0 ? "warning" : "default"}
          live={live}
          pulse={pulse}
        />
        <KpiCard
          label="Total payments"
          value={s ? compactNaira(s.totalPayments) : "—"}
          supporting="Cash collected in range"
          icon={Wallet}
          tone="info"
          live={live}
          pulse={pulse}
        />
        <KpiCard
          label="Net sales"
          value={s ? compactNaira(s.netSales) : "—"}
          supporting={
            s ? `After ${compactNaira(s.expenses)} expenses` : undefined
          }
          icon={BadgeDollarSign}
          tone={s && Number(s.netSales) < 0 ? "danger" : "success"}
          live={live}
          pulse={pulse}
        />
      </div>

      {/* Chart + side stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-premium p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">
                Sales performance
              </p>
              <p className="text-sm leading-normal text-slate-500 dark:text-muted-foreground">
                Sales vs expenses across {rangeLabel || "the selected range"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--chart-1)]" />
                Sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--chart-3)]" />
                Expenses
              </span>
            </div>
          </div>
          <SalesPerformanceChart data={s?.salesSeries ?? []} loading={loading && !s} />
        </div>

        <div className="grid gap-4">
          {/* Expenses in range */}
          <div className="card-premium p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  Expenses in range
                </p>
                <p className="mt-1.5 text-xl leading-tight font-bold tracking-tight tabular-nums text-danger">
                  {s ? naira(s.expenses) : "—"}
                </p>
              </div>
              <div className="grid size-10 place-items-center rounded-xl bg-danger-soft text-danger">
                <Banknote className="size-5" />
              </div>
            </div>
            {s && s.expenseCategories.length > 0 ? (
              <ul className="mt-4 grid gap-2.5">
                {s.expenseCategories.map((c) => {
                  const pct = Math.round(
                    (Number(c.amount) / maxExpense) * 100,
                  );
                  return (
                    <li key={c.category}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-slate-900 dark:text-foreground">
                          {c.category}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                          {compactNaira(c.amount)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-[var(--chart-3)] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-xs font-medium text-slate-500 dark:text-muted-soft">
                No expenses recorded in this range.
              </p>
            )}
          </div>

          {/* Tickets + role */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <div className="card-premium flex items-center gap-3 p-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                <Ticket className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  Tickets
                </p>
                <p className="text-xl leading-tight font-bold tracking-tight tabular-nums">
                  {s ? s.tickets : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-muted-soft">
                  Sales tickets in range
                </p>
              </div>
            </div>

            <div className="card-premium flex items-center gap-3 p-5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft-green text-primary">
                <Crown className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  Your role
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">
                    {userName}
                  </p>
                  <Badge variant={roleTone[role]}>{roleLabel[role]}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-muted-soft">
                  Signed in to {businessName}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Debtors / stock / latest sales */}
      <div className="grid gap-4 lg:grid-cols-3">
        <DebtorsCard
          rows={s?.debtors ?? []}
          total={s?.debtorsTotal ?? "0"}
          count={s?.debtorsCount ?? 0}
          loading={loading && !s}
        />
        <StockAlertsCard
          rows={s?.stockAlerts ?? []}
          total={s?.stockAlertsTotal ?? 0}
          loading={loading && !s}
        />
        <LatestSalesCard
          rows={s?.recentSales ?? []}
          loading={loading && !s}
        />
      </div>

      {/* subtle loading bar while silent refreshes run */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary transition-transform duration-500",
          loading ? "scale-x-100" : "scale-x-0",
        )}
        aria-hidden
      />

      {!s && loading ? (
        <div className="grid gap-4">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : null}
    </div>
  );
}
