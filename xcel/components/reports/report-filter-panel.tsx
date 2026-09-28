"use client";

import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { PRESETS, type DateRangeValue } from "@/components/dashboard/date-range-picker";

export type ReportFilterState = {
  range: DateRangeValue;
  productId: string;
  customerId: string;
  locationId: string;
  categoryId: string;
  group: string;
  brand: string;
  paymentMethod: string;
  soldById: string;
  timeFrom: string;
  timeTo: string;
};

export const defaultFilterState: ReportFilterState = {
  range: { key: "30d", from: "", to: "" },
  productId: "ALL",
  customerId: "ALL",
  locationId: "ALL",
  categoryId: "ALL",
  group: "ALL",
  brand: "ALL",
  paymentMethod: "ALL",
  soldById: "ALL",
  timeFrom: "",
  timeTo: "",
};

export function ReportFilterPanel({
  state,
  onChange,
  onApply,
  onReset,
  options,
  busy,
  visible,
  onToggleVisible,
}: {
  state: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
  onApply: () => void;
  onReset: () => void;
  options: {
    products: { id: string; name: string }[];
    customers: { id: string; name: string }[];
    locations: { id: string; name: string }[];
    categories: { id: string; name: string }[];
    brands: string[];
    staff: { id: string; name: string }[];
  } | null;
  busy: boolean;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  const set = <K extends keyof ReportFilterState>(key: K, value: ReportFilterState[K]) =>
    onChange({ ...state, [key]: value });

  const singleDay = state.range.from === state.range.to;
  const activeCount = countActive(state);

  return (
    <section className="card-premium overflow-hidden">
      <button
        type="button"
        onClick={onToggleVisible}
        aria-expanded={visible}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
      >
        <span className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-soft-green text-primary">
            <SlidersHorizontal className="size-4" />
          </span>
          <span className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Filters</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase tabular-nums text-primary-foreground">
              {activeCount} active
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          )}
          <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
            {visible ? "Hide" : "Show"}
          </span>
        </span>
      </button>

      {visible && (
        <div className="grid gap-4 border-t border-border/60 p-5 sm:grid-cols-2 xl:grid-cols-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Date range */}
          <Field label="Date range">
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    const t = new Date();
                    const ymd = (d: Date) =>
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    if (p.key === "custom") {
                      set("range", { ...state.range, key: "custom" });
                    } else if (p.key === "today") {
                      set("range", { key: "today", from: ymd(t), to: ymd(t) });
                    } else if (p.key === "yesterday") {
                      const y = new Date(t);
                      y.setDate(y.getDate() - 1);
                      set("range", { key: "yesterday", from: ymd(y), to: ymd(y) });
                    } else if (p.key === "7d") {
                      const f = new Date(t);
                      f.setDate(f.getDate() - 6);
                      set("range", { key: "7d", from: ymd(f), to: ymd(t) });
                    } else if (p.key === "30d") {
                      const f = new Date(t);
                      f.setDate(f.getDate() - 29);
                      set("range", { key: "30d", from: ymd(f), to: ymd(t) });
                    }
                  }}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-semibold transition-all",
                    state.range.key === p.key
                      ? "bg-primary text-primary-foreground shadow-card"
                      : "bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {state.range.key === "custom" && (
              <div className="mt-2 flex items-center gap-1.5">
                <Input
                  type="date"
                  value={state.range.from}
                  max={state.range.to}
                  onChange={(e) => set("range", { ...state.range, from: e.target.value })}
                  className="h-9"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-soft">→</span>
                <Input
                  type="date"
                  value={state.range.to}
                  min={state.range.from}
                  onChange={(e) => set("range", { ...state.range, to: e.target.value })}
                  className="h-9"
                  aria-label="To date"
                />
              </div>
            )}
          </Field>

          {/* Product */}
          <Field label="Product">
            <Select value={state.productId} onValueChange={(v) => set("productId", v)}>
              <SelectTrigger aria-label="Filter by product">
                <SelectValue placeholder="All products" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="ALL">All products</SelectItem>
                {options?.products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Customer */}
          <Field label="Customer">
            <Select value={state.customerId} onValueChange={(v) => set("customerId", v)}>
              <SelectTrigger aria-label="Filter by customer">
                <SelectValue placeholder="All customers" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="ALL">All customers</SelectItem>
                {options?.customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Group (customer type) */}
          <Field label="Group">
            <Select value={state.group} onValueChange={(v) => set("group", v)}>
              <SelectTrigger aria-label="Filter by customer group">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All groups</SelectItem>
                <SelectItem value="REGISTERED">Registered</SelectItem>
                <SelectItem value="WALK_IN">Walk-in</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Location */}
          <Field label="Location">
            <Select value={state.locationId} onValueChange={(v) => set("locationId", v)}>
              <SelectTrigger aria-label="Filter by location">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All locations</SelectItem>
                {options?.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Category */}
          <Field label="Category">
            <Select value={state.categoryId} onValueChange={(v) => set("categoryId", v)}>
              <SelectTrigger aria-label="Filter by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {options?.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Brand */}
          <Field label="Brand">
            <Select value={state.brand} onValueChange={(v) => set("brand", v)}>
              <SelectTrigger aria-label="Filter by brand">
                <SelectValue placeholder="All brands" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="ALL">All brands</SelectItem>
                {options?.brands.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Payment method */}
          <Field label="Payment method">
            <Select value={state.paymentMethod} onValueChange={(v) => set("paymentMethod", v)}>
              <SelectTrigger aria-label="Filter by payment method">
                <SelectValue placeholder="All methods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All methods</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="TRANSFER">Transfer</SelectItem>
                <SelectItem value="POS">POS</SelectItem>
                <SelectItem value="CREDIT">Credit</SelectItem>
                <SelectItem value="SPLIT">Split</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {/* Staff */}
          <Field label="Staff">
            <Select value={state.soldById} onValueChange={(v) => set("soldById", v)}>
              <SelectTrigger aria-label="Filter by staff">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="ALL">All staff</SelectItem>
                {options?.staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Time range (single-day only) */}
          <Field label={singleDay ? "Time range" : "Time range (single-day only)"}>
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                value={state.timeFrom}
                disabled={!singleDay}
                onChange={(e) => set("timeFrom", e.target.value)}
                className="h-10"
                aria-label="From time"
              />
              <span className="text-xs text-muted-soft">→</span>
              <Input
                type="time"
                value={state.timeTo}
                disabled={!singleDay}
                onChange={(e) => set("timeTo", e.target.value)}
                className="h-10"
                aria-label="To time"
              />
            </div>
          </Field>

          <div className="flex items-end xl:col-span-4">
            <Button onClick={onApply} disabled={busy} className="min-w-36">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Apply filters
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function countActive(s: ReportFilterState): number {
  return (
    (s.productId !== "ALL" ? 1 : 0) +
    (s.customerId !== "ALL" ? 1 : 0) +
    (s.locationId !== "ALL" ? 1 : 0) +
    (s.categoryId !== "ALL" ? 1 : 0) +
    (s.group !== "ALL" ? 1 : 0) +
    (s.brand !== "ALL" ? 1 : 0) +
    (s.paymentMethod !== "ALL" ? 1 : 0) +
    (s.soldById !== "ALL" ? 1 : 0) +
    (s.timeFrom ? 1 : 0) +
    (s.timeTo ? 1 : 0)
  );
}
