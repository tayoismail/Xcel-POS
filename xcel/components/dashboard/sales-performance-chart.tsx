"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { SalesSeriesPoint } from "@/app/actions/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyCompact as naira } from "@/lib/utils";

type TooltipPayload = {
  payload?: SalesSeriesPoint;
  dataKey?: string | number;
  value?: number | string;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2 shadow-card-lg">
      <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
        {row?.label ?? label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary">
        Sales {naira(row?.sales ?? 0)}
      </p>
      <p className="text-sm font-semibold tabular-nums text-danger">
        Expenses {naira(row?.expenses ?? 0)}
      </p>
    </div>
  );
}

export function SalesPerformanceChart({
  data,
  loading = false,
}: {
  data: SalesSeriesPoint[];
  loading?: boolean;
}) {
  if (loading && data.length === 0) {
    return <Skeleton className="h-[260px] w-full rounded-xl" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-secondary/30">
        <p className="text-sm text-slate-500 dark:text-muted-foreground">
          No activity in this range.
        </p>
      </div>
    );
  }

  const hasExpense = data.some((d) => d.expenses > 0);

  return (
    <div className="h-[260px] w-full animate-in fade-in duration-300">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dashSalesFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="dashExpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
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
            width={52}
            tick={{ fontSize: 11, fill: "var(--muted-soft)" }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
            }
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)" }} />
          <Area
            type="monotone"
            dataKey="sales"
            name="Sales"
            stroke="var(--chart-1)"
            strokeWidth={2.25}
            fill="url(#dashSalesFill)"
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
              fill="url(#dashExpFill)"
              animationDuration={450}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
