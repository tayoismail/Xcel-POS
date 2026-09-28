"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  createPurchaseAction,
  createSupplierAction,
  listSuppliersAction,
  searchPurchaseProductsAction,
  type PurchaseProductOption,
  type SupplierOption,
} from "@/app/actions/purchases";
import { listLocationsAction } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn, formatCurrency as naira } from "@/lib/utils";

type LocationOption = { id: string; name: string };

type ItemRow = {
  key: string;
  productId: string;
  name: string;
  sku: string;
  qty: string;
  unitCost: string;
};

const METHODS = ["CASH", "TRANSFER", "POS", "CREDIT", "SPLIT"] as const;
const PAY_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PurchaseFormDialog({
  open,
  onOpenChange,
  mode,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "single" | "bulk";
  onSaved: () => void;
}) {
  const isBulk = mode === "bulk";

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [supplierId, setSupplierId] = useState("NONE");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<string>("UNPAID");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [receiveNow, setReceiveNow] = useState(false);
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PurchaseProductOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const grandTotal = useMemo(
    () =>
      items.reduce(
        (s, i) => s + (Number(i.qty) || 0) * (Number(i.unitCost) || 0),
        0,
      ),
    [items],
  );

  const effectivePaid =
    paymentStatus === "PAID"
      ? grandTotal
      : paymentStatus === "UNPAID"
        ? 0
        : Math.min(Math.max(0, Number(amountPaid) || 0), grandTotal);

  // Load lookups + initial product list when the dialog opens
  useEffect(() => {
    if (!open) return;
    setLocations([]);
    setSuppliers([]);
    setSupplierId("NONE");
    setItems([]);
    setPaymentStatus("UNPAID");
    setPaymentMethod("CASH");
    setAmountPaid("");
    setNotes("");
    setReceiveNow(false);
    setQuery("");
    setResults([]);
    setChecked(new Set());
    setShowNewSupplier(false);
    setNewSupplierName("");
    setNewSupplierPhone("");

    void listLocationsAction()
      .then((rows) => {
        setLocations(rows);
        if (rows.length) setLocationId((prev) => prev || rows[0].id);
      })
      .catch(() => toast.error("Couldn't load locations"));
    void listSuppliersAction()
      .then(setSuppliers)
      .catch(() => toast.error("Couldn't load suppliers"));
    void searchPurchaseProductsAction("")
      .then(setResults)
      .catch(() => toast.error("Couldn't search products"));
  }, [open]);

  // Debounced product search
  useEffect(() => {
    if (!open) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearching(true);
    searchTimer.current = setTimeout(() => {
      searchPurchaseProductsAction(query)
        .then(setResults)
        .catch(() => toast.error("Couldn't search products"))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, open]);

  function addProduct(p: PurchaseProductOption) {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.id
            ? { ...i, qty: String((Number(i.qty) || 0) + 1) }
            : i,
        );
      }
      return [
        ...prev,
        {
          key: newKey(),
          productId: p.id,
          name: p.name,
          sku: p.sku,
          qty: "1",
          unitCost: p.costPrice,
        },
      ];
    });
  }

  function addCheckedProducts() {
    const picked = results.filter((p) => checked.has(p.id));
    if (!picked.length) return;
    setItems((prev) => {
      const next = [...prev];
      for (const p of picked) {
        const existing = next.find((i) => i.productId === p.id);
        if (existing) {
          existing.qty = String((Number(existing.qty) || 0) + 1);
        } else {
          next.push({
            key: newKey(),
            productId: p.id,
            name: p.name,
            sku: p.sku,
            qty: "1",
            unitCost: p.costPrice,
          });
        }
      }
      return next;
    });
    setChecked(new Set());
    toast.success(`Added ${picked.length} product${picked.length === 1 ? "" : "s"}`);
  }

  function updateItem(key: string, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function addSupplier() {
    const name = newSupplierName.trim();
    if (!name) {
      toast.error("Enter a supplier name");
      return;
    }
    setAddingSupplier(true);
    try {
      const res = await createSupplierAction({
        name,
        phone: newSupplierPhone,
      });
      if (!res.ok || !res.supplierId) {
        toast.error("Couldn't add supplier", { description: res.ok ? "Try again." : res.error });
        return;
      }
      const option: SupplierOption = {
        id: res.supplierId,
        name,
        phone: newSupplierPhone.trim() || null,
      };
      setSuppliers((prev) => [...prev, option].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(res.supplierId);
      setNewSupplierName("");
      setNewSupplierPhone("");
      setShowNewSupplier(false);
      toast.success(`Supplier “${name}” added`);
    } finally {
      setAddingSupplier(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one item");
      return;
    }
    for (const i of items) {
      const qty = Number(i.qty);
      const cost = Number(i.unitCost);
      if (!Number.isInteger(qty) || qty < 1) {
        toast.error(`Invalid quantity for ${i.name}`);
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        toast.error(`Invalid cost for ${i.name}`);
        return;
      }
    }
    if (paymentStatus === "PARTIAL" && effectivePaid <= 0) {
      toast.error("Enter the amount already paid");
      return;
    }

    setSaving(true);
    try {
      const res = await createPurchaseAction({
        supplierId: supplierId === "NONE" ? null : supplierId,
        locationId,
        items: items.map((i) => ({
          productId: i.productId,
          qty: Number(i.qty),
          unitCost: Number(i.unitCost),
        })),
        paymentStatus: paymentStatus as "PAID" | "PARTIAL" | "UNPAID",
        paymentMethod: paymentMethod as "CASH",
        amountPaid: effectivePaid,
        notes,
        receiveNow,
      });
      if (!res.ok) {
        toast.error("Couldn't create purchase", { description: res.error });
        return;
      }
      toast.success(`Purchase ${res.referenceNo} created`, {
        description: res.received
          ? "Stock levels updated."
          : "Receive it later to update stock.",
      });
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
          <DialogTitle className="flex items-center gap-2">
            {isBulk ? <Layers className="size-4 text-primary" /> : null}
            {isBulk ? "New purchase — bulk items" : "New purchase"}
          </DialogTitle>
          <DialogDescription>
            {isBulk
              ? "Tick multiple products below, then add them all at once. Set qty and cost per line."
              : "Supplier, location, items, payment status and notes for this purchase."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          {/* Supplier + location */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Supplier</Label>
                <button
                  type="button"
                  onClick={() => setShowNewSupplier((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="size-3.5" />
                  New supplier
                </button>
              </div>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full" aria-label="Supplier">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No supplier</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showNewSupplier && (
                <div className="grid gap-2 rounded-xl border border-border/70 bg-secondary/50 p-3">
                  <Input
                    placeholder="Supplier name"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    aria-label="New supplier name"
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={newSupplierPhone}
                    onChange={(e) => setNewSupplierPhone(e.target.value)}
                    aria-label="New supplier phone"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setShowNewSupplier(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      onClick={() => void addSupplier()}
                      disabled={addingSupplier}
                    >
                      {addingSupplier ? "Adding…" : "Add supplier"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="w-full" aria-label="Location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Product picker */}
          <div className="grid gap-2">
            <Label htmlFor="purchase-product-search">
              Items {isBulk ? "(bulk)" : ""}
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-soft" />
              <Input
                id="purchase-product-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search product name, SKU or barcode…"
                className="pl-9"
                autoComplete="off"
              />
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-border/70 bg-card">
              {searching && results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-muted-foreground">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500 dark:text-muted-foreground">
                  No products match your search.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {results.map((p) => {
                    const inList = items.some((i) => i.productId === p.id);
                    return (
                      <li key={p.id}>
                        {isBulk ? (
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-secondary/60">
                            <Checkbox
                              checked={checked.has(p.id)}
                              onCheckedChange={(v) =>
                                setChecked((prev) => {
                                  const next = new Set(prev);
                                  if (v) next.add(p.id);
                                  else next.delete(p.id);
                                  return next;
                                })
                              }
                              aria-label={`Select ${p.name}`}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-foreground">
                              {p.name}
                              <span className="ml-2 font-mono text-xs text-slate-500 dark:text-muted-foreground">
                                {p.sku}
                              </span>
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {naira(Number(p.costPrice))}
                            </span>
                          </label>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addProduct(p)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60"
                          >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-foreground">
                              {p.name}
                              <span className="ml-2 font-mono text-xs text-slate-500 dark:text-muted-foreground">
                                {p.sku}
                              </span>
                            </span>
                            {inList ? (
                              <span className="rounded-full bg-soft-green px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase text-primary">
                                In list
                              </span>
                            ) : null}
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {naira(Number(p.costPrice))}
                            </span>
                            <Plus className="size-3.5 shrink-0 text-primary" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {isBulk && checked.size > 0 && (
              <Button
                type="button"
                size="sm"
                className="justify-self-start"
                onClick={addCheckedProducts}
              >
                <Plus className="size-4" />
                Add {checked.size} selected
              </Button>
            )}
          </div>

          {/* Item rows */}
          {items.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/50 text-left text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
                    <th className="px-3 py-2">Product</th>
                    <th className="w-20 px-2 py-2">Qty</th>
                    <th className="w-28 px-2 py-2">Unit cost</th>
                    <th className="w-28 px-2 py-2 text-right">Subtotal</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((i) => {
                    const line = (Number(i.qty) || 0) * (Number(i.unitCost) || 0);
                    return (
                      <tr key={i.key}>
                        <td className="max-w-48 px-3 py-2">
                          <span className="block truncate font-medium">{i.name}</span>
                          <span className="font-mono text-xs text-slate-500 dark:text-muted-foreground">
                            {i.sku}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={i.qty}
                            onChange={(e) => updateItem(i.key, { qty: e.target.value })}
                            className="h-8 px-2 text-sm tabular-nums"
                            aria-label={`Quantity for ${i.name}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={i.unitCost}
                            onChange={(e) => updateItem(i.key, { unitCost: e.target.value })}
                            className="h-8 px-2 text-sm tabular-nums"
                            aria-label={`Unit cost for ${i.name}`}
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">
                          {naira(line)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => removeItem(i.key)}
                            aria-label={`Remove ${i.name}`}
                          >
                            <X className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-sm text-slate-500 dark:text-muted-foreground">
              No items yet — search and add products above.
            </p>
          )}

          {/* Payment */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label>Payment status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="w-full" aria-label="Payment status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="purchase-amount-paid">Amount paid</Label>
              <Input
                id="purchase-amount-paid"
                type="number"
                min={0}
                step="0.01"
                value={
                  paymentStatus === "PAID"
                    ? grandTotal.toFixed(2)
                    : paymentStatus === "UNPAID"
                      ? "0.00"
                      : amountPaid
                }
                disabled={paymentStatus !== "PARTIAL"}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Payment method</Label>
              <Select
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                disabled={paymentStatus === "UNPAID"}
              >
                <SelectTrigger className="w-full" aria-label="Payment method">
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
          </div>

          {/* Receive + notes */}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
            <Checkbox
              checked={receiveNow}
              onCheckedChange={(v) => setReceiveNow(v === true)}
              aria-label="Receive now"
            />
            Receive now — add stock and record PURCHASE movements
          </label>

          <div className="grid gap-2">
            <Label htmlFor="purchase-notes">Notes</Label>
            <Textarea
              id="purchase-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery note, bill reference, supplier comments…"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-3">
            <span className="text-sm text-slate-500 dark:text-muted-foreground">
              {items.length} line{items.length === 1 ? "" : "s"}
              {paymentStatus === "PARTIAL" && effectivePaid > 0 ? (
                <>
                  {" · due "}
                  <span className={cn("font-semibold", effectivePaid < grandTotal && "text-danger")}>
                    {naira(Math.max(0, grandTotal - effectivePaid))}
                  </span>
                </>
              ) : null}
            </span>
            <span className="text-sm text-muted-foreground">
              Grand total{" "}
              <strong className="ml-1 text-lg font-bold text-slate-900 tabular-nums dark:text-foreground">
                {naira(grandTotal)}
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
            <Button type="submit" disabled={saving || items.length === 0}>
              {saving ? "Saving…" : receiveNow ? "Create & receive" : "Create purchase"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
