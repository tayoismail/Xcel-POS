"use client";

import { Activity } from "lucide-react";

import type { RecentSaleRow } from "@/app/actions/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency as naira } from "@/lib/utils";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const payTone: Record<string, "default" | "warning" | "destructive" | "info"> = {
  PAID: "default",
  PARTIAL: "warning",
  UNPAID: "destructive",
};

export function LatestSalesCard({
  rows,
  loading = false,
}: {
  rows: RecentSaleRow[];
  loading?: boolean;
}) {
  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Latest sales</p>
          <p className="text-xs font-medium text-slate-500 dark:text-muted-soft">Newest transactions first</p>
        </div>
        <span className="rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
          {rows.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && rows.length === 0 ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No sales yet"
            description="Complete a checkout and it will appear here instantly."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((sale) => (
              <li
                key={sale.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">
                    {sale.invoiceNo}
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-muted-foreground">
                    {sale.customerName ?? "Walk-in"} · {formatTime(sale.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums">
                    {naira(sale.totalAmount)}
                  </span>
                  <Badge variant={payTone[sale.paymentStatus] ?? "outline"}>
                    {sale.paymentStatus}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
