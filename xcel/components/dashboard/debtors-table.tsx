"use client";

import { ReceiptText } from "lucide-react";

import type { DebtorRow } from "@/app/actions/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function DebtorsCard({
  rows,
  total,
  count,
  loading = false,
}: {
  rows: DebtorRow[];
  total: string;
  count: number;
  loading?: boolean;
}) {
  return (
    <div className="card-premium flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
            <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Debtors</p>
          <p className="text-xs font-medium text-slate-500 dark:text-muted-soft">
            Open invoice balances · {count} debtor{count === 1 ? "" : "s"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-danger">
          {naira(total)}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && rows.length === 0 ? (
          <div className="grid gap-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No open invoices"
            description="Invoices with an outstanding balance will show up here."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">
                    {d.customerName ?? "Walk-in customer"}
                  </p>
                  <p className="truncate font-mono text-xs text-slate-500 dark:text-muted-foreground">
                    {d.number}
                    {d.dueDate ? ` · due ${formatDate(d.dueDate)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-sm font-semibold tabular-nums text-danger">
                    {naira(d.balance)}
                  </span>
                  {d.daysOverdue > 0 ? (
                    <Badge variant="destructive">{d.daysOverdue}d late</Badge>
                  ) : d.dueDate ? (
                    <Badge variant="warning">Due soon</Badge>
                  ) : (
                    <Badge variant="outline">Open</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
