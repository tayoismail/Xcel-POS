"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createInvoiceAction,
  listCustomerOptionsAction,
  type CustomerOption,
} from "@/app/actions/invoices";
import {
  emptyLine,
  linesTotal,
  LineItemsEditor,
  type DocLine,
} from "@/components/shared/line-items-editor";
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
import { Textarea } from "@/components/ui/textarea";

const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceFormDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("NONE");
  const [status, setStatus] = useState("ISSUED");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId("NONE");
    setStatus("ISSUED");
    setDueDate("");
    setNotes("");
    setLines([emptyLine()]);
    void listCustomerOptionsAction().then(setCustomers).catch(() => toast.error("Couldn't load customers"));
  }, [open]);

  const total = linesTotal(lines);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = lines
      .filter((l) => l.name.trim())
      .map((l) => ({
        productId: l.productId,
        name: l.name.trim(),
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
      }));
    if (!payload.length) {
      toast.error("Add at least one line item");
      return;
    }

    setSaving(true);
    try {
      const res = await createInvoiceAction({
        customerId: customerId === "NONE" ? null : customerId,
        dueDate: dueDate || null,
        notes,
        status: status as "DRAFT" | "ISSUED",
        lines: payload,
      });
      if (!res.ok) {
        toast.error("Couldn't create invoice", { description: res.error });
        return;
      }
      toast.success(`Invoice ${res.number} created`);
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Formal invoice with line items — print or download as PDF after saving.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger className="w-full" aria-label="Customer">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Walk-in customer</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full" aria-label="Status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-due">Due date</Label>
              <Input
                id="inv-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={today()}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Line items</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="inv-notes">Notes</Label>
            <Textarea
              id="inv-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, thank-you note…"
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-sm text-slate-500 dark:text-muted-foreground">
              {lines.filter((l) => l.name.trim()).length} line(s)
            </span>
            <span className="text-sm text-muted-foreground">
              Total{" "}
              <strong className="ml-1 text-lg font-bold text-slate-900 tabular-nums dark:text-foreground">
                {formatCurrency(total)}
              </strong>
            </span>
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
              {saving ? "Creating…" : "Create invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
