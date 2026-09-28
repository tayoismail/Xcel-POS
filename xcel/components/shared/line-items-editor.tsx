"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { searchPurchaseProductsAction } from "@/app/actions/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency as naira } from "@/lib/utils";

export type DocLine = {
  key: string;
  productId: string | null;
  name: string;
  qty: string;
  unitPrice: string;
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const emptyLine = (): DocLine => ({
  key: newKey(),
  productId: null,
  name: "",
  qty: "1",
  unitPrice: "",
});

export function lineTotal(line: DocLine) {
  return (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
}

export function linesTotal(lines: DocLine[]) {
  return lines.reduce((s, l) => s + lineTotal(l), 0);
}

/**
 * Editable line-item table shared by invoices and quotations:
 * free-text descriptions plus an optional product picker that fills
 * name and unit price from the catalog.
 */
export function LineItemsEditor({
  lines,
  onChange,
  showProductPicker = true,
}: {
  lines: DocLine[];
  onChange: (lines: DocLine[]) => void;
  showProductPicker?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; name: string; sku: string; price: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showProductPicker) return;
    if (timer.current) clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(() => {
      searchPurchaseProductsAction(query)
        .then((rows) =>
          setResults(
            rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, price: r.price })),
          ),
        )
        .catch(() => toast.error("Couldn't search products"))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, showProductPicker]);

  function update(key: string, patch: Partial<DocLine>) {
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(p: { id: string; name: string; price: string }) {
    const existing = lines.find((l) => l.productId === p.id);
    if (existing) {
      update(existing.key, { qty: String((Number(existing.qty) || 0) + 1) });
    } else {
      onChange([
        ...lines,
        {
          key: newKey(),
          productId: p.id,
          name: p.name,
          qty: "1",
          unitPrice: p.price,
        },
      ]);
    }
    setQuery("");
  }

  const total = linesTotal(lines);

  return (
    <div className="grid gap-2">
      {showProductPicker && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-soft" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add from catalog — search name or SKU…"
            className="pl-9"
            autoComplete="off"
            aria-label="Search catalog"
          />
          {(query !== "" || searching) && (
            <div className="absolute top-full left-0 z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-border/70 bg-popover shadow-card-lg">
              {searching && !results.length ? (
                <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-muted-foreground">Searching…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-muted-foreground">No products found.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickProduct(p)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary/60"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-foreground">
                          {p.name}
                          <span className="ml-2 font-mono text-xs text-slate-500 dark:text-muted-foreground">
                            {p.sku}
                          </span>
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {naira(Number(p.price))}
                        </span>
                        <Plus className="size-3.5 shrink-0 text-primary" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/50 text-left text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
              <th className="px-3 py-2">Description</th>
              <th className="w-20 px-2 py-2">Qty</th>
              <th className="w-28 px-2 py-2">Unit price</th>
              <th className="w-28 px-2 py-2 text-right">Subtotal</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-2 py-2">
                  <Input
                    value={l.name}
                    onChange={(e) => update(l.key, { name: e.target.value })}
                    placeholder="Item description"
                    className="h-8 px-2 text-sm"
                    aria-label="Line description"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={l.qty}
                    onChange={(e) => update(l.key, { qty: e.target.value })}
                    className="h-8 px-2 text-sm tabular-nums"
                    aria-label="Quantity"
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) => update(l.key, { unitPrice: e.target.value })}
                    className="h-8 px-2 text-sm tabular-nums"
                    aria-label="Unit price"
                  />
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                  {naira(lineTotal(l))}
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                    aria-label="Remove line"
                  >
                    <X className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">
                  No lines yet — search the catalog or add a custom line.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onChange([...lines, emptyLine()])}
        >
          <Plus className="size-3.5" />
          Custom line
        </Button>
        <span className="text-sm text-muted-foreground">
          Total{" "}
          <strong className="ml-1 text-base font-bold text-slate-900 tabular-nums dark:text-foreground">
            {naira(total)}
          </strong>
        </span>
      </div>
    </div>
  );
}
