"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";

import type { StockAlertRow } from "@/app/actions/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PAGE = 5;

const statusMeta: Record<
  StockAlertRow["status"],
  { label: string; variant: "destructive" | "warning" | "info" }
> = {
  NEGATIVE: { label: "Negative", variant: "destructive" },
  OUT: { label: "Out", variant: "destructive" },
  LOW: { label: "Low", variant: "warning" },
};

export function StockAlertsCard({
  rows,
  total,
  loading = false,
}: {
  rows: StockAlertRow[];
  total: number;
  loading?: boolean;
}) {
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(total / PAGE));
  const safePage = Math.min(page, pageCount);
  const slice =
    rows.length <= PAGE
      ? rows
      : rows.slice((safePage - 1) * PAGE, safePage * PAGE);
  const start = total === 0 ? 0 : (safePage - 1) * PAGE + 1;
  const end = Math.min(safePage * PAGE, total);

  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Stock alerts</p>
          <p className="text-xs font-medium text-slate-500 dark:text-muted-soft">
            Negative &amp; low items needing attention
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            total > 0
              ? "bg-warning-soft text-warning"
              : "bg-secondary text-muted-foreground",
          )}
        >
          {total}
        </span>
      </div>

      <div className="flex-1">
        {loading && rows.length === 0 ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Stock looks healthy"
            description="No negative or low-stock items right now."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {slice.map((row) => {
              const meta = statusMeta[row.status];
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">
                      {row.productName}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-500 dark:text-muted-foreground">
                      {row.sku} · {row.locationName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        row.quantity < 0 ? "text-danger" : "text-foreground",
                      )}
                    >
                      {row.quantity}
                      <span className="ml-1 text-xs font-medium text-slate-500 dark:text-muted-soft">
                        / alert {row.alertAt}
                      </span>
                    </span>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {total > PAGE ? (
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2.5">
          <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
            Showing {start}–{end} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              aria-label="Previous stock alerts"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              aria-label="Next stock alerts"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
