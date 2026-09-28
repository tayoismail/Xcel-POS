"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";

import {
  getSaleDetailAction,
  type SaleDetail,
} from "@/app/actions/sales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency as naira } from "@/lib/utils";

export const methodBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  CASH: { label: "Cash", variant: "outline" },
  TRANSFER: { label: "Transfer", variant: "info" },
  POS: { label: "POS", variant: "info" },
  CREDIT: { label: "Credit", variant: "warning" },
  SPLIT: { label: "Split", variant: "secondary" },
};

export const payStatusBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  PAID: { label: "Paid", variant: "default" },
  PARTIAL: { label: "Partial", variant: "warning" },
  UNPAID: { label: "Unpaid", variant: "destructive" },
};

export const saleStatusBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  COMPLETED: { label: "Completed", variant: "secondary" },
  REFUNDED: { label: "Refunded", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

export function SaleDetailDrawer({
  saleId,
  open,
  onOpenChange,
  refreshKey,
  onPrint,
}: {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bump after mutations so an open drawer reloads fresh data. */
  refreshKey: number;
  onPrint: (saleId: string) => void;
}) {
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!saleId) return;
    setLoading(true);
    try {
      const res = await getSaleDetailAction(saleId);
      if (res.ok) setSale(res.sale);
      else toast.error(res.error);
    } catch {
      toast.error("Couldn't load sale details");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    if (open && saleId) void load();
  }, [open, saleId, load, refreshKey]);

  const method = sale ? methodBadge[sale.paymentMethod] : null;
  const pay = sale ? payStatusBadge[sale.paymentStatus] : null;
  const status = sale ? saleStatusBadge[sale.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="sticky top-0 z-10 border-b border-border/70 bg-popover px-5 py-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="grid gap-1">
              <SheetTitle className="flex items-center gap-2">
                <Receipt className="size-4 text-primary" />
                {sale ? sale.invoiceNo : "Sale details"}
              </SheetTitle>
              <SheetDescription>
                {sale
                  ? new Date(sale.createdAt).toLocaleString("en-NG", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Loading…"}
              </SheetDescription>
            </div>
          </div>
          {sale && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {status && <Badge variant={status.variant}>{status.label}</Badge>}
              {pay && <Badge variant={pay.variant}>{pay.label}</Badge>}
              {method && <Badge variant={method.variant}>{method.label}</Badge>}
            </div>
          )}
        </SheetHeader>

        <div className="grid gap-5 px-5 py-4">
          {loading && !sale ? (
            <div className="grid gap-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-28 w-full rounded-xl" />
            </div>
          ) : sale ? (
            <>
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-secondary/50 p-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-semibold">{sale.customerName ?? "Walk-in"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sold by</p>
                  <p className="font-semibold">{sale.soldByName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-semibold">{sale.locationName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Items</p>
                  <p className="font-semibold tabular-nums">{sale.itemsCount}</p>
                </div>
              </div>

              {/* Items */}
              <section className="grid gap-2">
                <h4 className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  Items
                </h4>
                <div className="overflow-hidden rounded-xl border border-border/70">
                  <div className="grid grid-cols-[minmax(0,1fr)_44px_80px_90px] gap-2 border-b border-border/70 bg-muted/60 px-3 py-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                    <span>Product</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Subtotal</span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {sale.items.map((i, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[minmax(0,1fr)_44px_80px_90px] items-center gap-2 px-3 py-2 text-sm"
                      >
                        <span className="truncate font-medium text-slate-900 dark:text-foreground">{i.name}</span>
                        <span className="text-center tabular-nums">{i.qty}</span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {naira(i.unitPrice)}
                        </span>
                        <span className="text-right font-semibold tabular-nums">
                          {naira(i.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Payment breakdown */}
              <section className="grid gap-2">
                <h4 className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  Payment breakdown
                </h4>
                {sale.payments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
                    No payments recorded yet.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {sale.payments.map((p) => {
                      const m = methodBadge[p.method];
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5"
                        >
                          <div className="grid gap-0.5">
                            <Badge variant={m?.variant ?? "outline"} className="w-fit">
                              {m?.label ?? p.method}
                            </Badge>
                            <span className="text-xs text-slate-500 dark:text-muted-foreground">
                              {new Date(p.createdAt).toLocaleString("en-NG", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </span>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-foreground">
                            {naira(p.amount)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Totals */}
                <div className="mt-1 grid gap-1.5 rounded-xl border border-border/70 bg-secondary/50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-foreground">{naira(sale.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-semibold tabular-nums text-primary">
                      {naira(sale.totalPaid)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/70 pt-1.5">
                    <span className="font-medium">Due</span>
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        Number(sale.due) > 0 ? "text-danger" : "text-muted-foreground",
                      )}
                    >
                      {naira(sale.due)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Linked invoices */}
              <section className="grid gap-2 pb-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                  <FileText className="size-3.5" />
                  Invoices
                </h4>
                {sale.invoices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-muted-foreground">
                    No invoices linked to this sale.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {sale.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-2.5"
                      >
                        <div className="grid gap-0.5">
                          <span className="font-mono text-sm font-semibold tracking-tight">{inv.number}</span>
                          <span className="text-xs text-slate-500 dark:text-muted-foreground">
                            {inv.status}
                            {inv.dueDate
                              ? ` · due ${new Date(inv.dueDate).toLocaleDateString("en-NG", {
                                  day: "numeric",
                                  month: "short",
                                })}`
                              : ""}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-foreground">
                            {naira(inv.totalAmount)}
                          </p>
                          <p className="text-xs text-slate-500 tabular-nums dark:text-muted-foreground">
                            Paid {naira(inv.amountPaid)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Sale not found.</p>
          )}
        </div>

        {sale && (
          <div className="sticky bottom-0 border-t border-border/70 bg-popover px-5 py-3">
            <Button className="w-full" size="lg" onClick={() => onPrint(sale.id)}>
              <Printer className="size-4" />
              Print receipt
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
