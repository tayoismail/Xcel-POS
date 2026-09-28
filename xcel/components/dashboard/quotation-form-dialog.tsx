"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { createQuotationAction } from "@/app/actions/quotations";
import {
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { formatCurrency as naira } from "@/lib/utils";

export function QuotationFormDialog({
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
  const [status, setStatus] = useState("DRAFT");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DocLine[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId("NONE");
    setStatus("DRAFT");
    setValidUntil("");
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
      const res = await createQuotationAction({
        customerId: customerId === "NONE" ? null : customerId,
        validUntil: validUntil || null,
        notes,
        status: status as "DRAFT" | "SENT",
        lines: payload,
      });
      if (!res.ok) {
        toast.error("Couldn't create quotation", { description: res.error });
        return;
      }
      toast.success(`Quotation ${res.number} created`);
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
          <DialogTitle>New quotation</DialogTitle>
          <DialogDescription>
            Quote items for a customer — convert to an invoice or POS sale later.
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
                  <SelectItem value="NONE">No customer</SelectItem>
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
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="qtn-valid">Valid until</Label>
              <Input
                id="qtn-valid"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Line items</Label>
            <LineItemsEditor lines={lines} onChange={setLines} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="qtn-notes">Notes</Label>
            <Textarea
              id="qtn-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Validity, warranty, delivery terms…"
            />
          </div>

          <div className="flex items-center justify-end border-t border-border/70 pt-3">
            <span className="text-sm text-muted-foreground">
              Total{" "}
              <strong className="ml-1 text-lg font-bold text-slate-900 tabular-nums dark:text-foreground">
                {naira(total)}
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
              {saving ? "Creating…" : "Create quotation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
