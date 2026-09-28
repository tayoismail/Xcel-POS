"use client";

import { useEffect, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import { toast } from "sonner";

import {
  createInvoiceFromSaleAction,
  listCreditSalesAction,
  type CreditSaleRow,
} from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function InvoiceFromSaleDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<CreditSaleRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRows(null);
      return;
    }
    listCreditSalesAction()
      .then(setRows)
      .catch(() => {
        setRows([]);
        toast.error("Couldn't load credit sales");
      });
  }, [open]);

  async function generate(saleId: string, invoiceNo: string) {
    setBusyId(saleId);
    try {
      const res = await createInvoiceFromSaleAction(saleId);
      if (!res.ok) {
        toast.error("Couldn't generate invoice", { description: res.error });
        return;
      }
      toast.success(`Invoice ${res.number} created from ${invoiceNo}`);
      onSaved();
      onOpenChange(false);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Generate from credit sale</DialogTitle>
          <DialogDescription>
            Unpaid and partial sales without an invoice yet.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border/70">
          {rows === null ? (
            <div className="grid gap-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="grid place-items-center gap-2 px-6 py-10 text-center">
              <Receipt className="size-8 text-muted-soft" />
              <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">No credit sales pending</p>
              <p className="max-w-sm text-sm text-slate-500 dark:text-muted-foreground">
                Every unpaid or partial sale already has an invoice — or there
                simply are none yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {rows.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-3 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold tracking-tight">{s.invoiceNo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(s.createdAt)} · {s.customerName ?? "Walk-in"} ·{" "}
                      {s.soldByName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {naira(s.totalAmount)}
                    </p>
                    <p className="text-xs text-danger tabular-nums">
                      due {naira(s.due)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id}
                    onClick={() => void generate(s.id, s.invoiceNo)}
                  >
                    <FileText className="size-4" />
                    {busyId === s.id ? "Generating…" : "Generate"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
