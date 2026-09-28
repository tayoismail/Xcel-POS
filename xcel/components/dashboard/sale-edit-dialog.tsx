"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { updateSaleAction, type SaleRow } from "@/app/actions/sales";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const METHODS = ["CASH", "TRANSFER", "POS", "CREDIT", "SPLIT"] as const;
const STATUSES = ["PAID", "PARTIAL", "UNPAID"] as const;

export function SaleEditDialog({
  sale,
  open,
  onOpenChange,
  onSaved,
}: {
  sale: SaleRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<string>("CASH");
  const [status, setStatus] = useState<string>("PAID");
  const [amountPaid, setAmountPaid] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && sale) {
      setMethod(sale.paymentMethod);
      setStatus(sale.paymentStatus);
      setAmountPaid(sale.totalPaid);
    }
  }, [open, sale]);

  const total = sale ? Number(sale.totalAmount) : 0;
  const effectivePaid =
    status === "PAID" ? total : status === "UNPAID" ? 0 : Math.min(Math.max(0, Number(amountPaid) || 0), total);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale) return;
    setSaving(true);
    try {
      const res = await updateSaleAction({
        saleId: sale.id,
        paymentMethod: method as "CASH",
        paymentStatus: status as "PAID",
        amountPaid: effectivePaid,
      });
      if (!res.ok) {
        toast.error("Couldn't update sale", { description: res.error });
        return;
      }
      toast.success(`Sale ${sale.invoiceNo} updated`);
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit sale {sale?.invoiceNo}</DialogTitle>
          <DialogDescription>
            Correct the payment method or status. Totals recalculate automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Payment status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sale-amount-paid">Amount paid</Label>
            <Input
              id="sale-amount-paid"
              type="number"
              min={0}
              max={total}
              step="0.01"
              value={status === "PAID" ? total.toFixed(2) : status === "UNPAID" ? "0.00" : amountPaid}
              disabled={status !== "PARTIAL"}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            <p className="text-xs text-muted-foreground tabular-nums">
              Total {formatCurrency(total)} · Due{" "}
              <span className="font-semibold">{formatCurrency(total - effectivePaid)}</span>
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
