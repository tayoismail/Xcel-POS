"use client";

import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";

export type DateRangeValue = {
  key: RangeKey;
  /** yyyy-MM-dd */
  from: string;
  /** yyyy-MM-dd */
  to: string;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function todayRange(): DateRangeValue {
  const t = new Date();
  return { key: "today", from: ymd(t), to: ymd(t) };
}

export function rangeFromKey(key: RangeKey, current: DateRangeValue): DateRangeValue {
  const t = new Date();
  switch (key) {
    case "today":
      return { key, from: ymd(t), to: ymd(t) };
    case "yesterday": {
      const y = addDays(t, -1);
      return { key, from: ymd(y), to: ymd(y) };
    }
    case "7d":
      return { key, from: ymd(addDays(t, -6)), to: ymd(t) };
    case "30d":
      return { key, from: ymd(addDays(t, -29)), to: ymd(t) };
    case "custom":
      return { ...current, key: "custom" };
  }
}

export const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "custom", label: "Custom" },
];

export function DateRangePicker({
  value,
  onChange,
  busy = false,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-border/70 bg-card p-1 shadow-card">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={busy}
            onClick={() => onChange(rangeFromKey(p.key, value))}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-semibold transition-all disabled:opacity-60",
              value.key === p.key
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {p.key === "custom" ? <CalendarDays className="size-3.5" /> : null}
            {p.label}
          </button>
        ))}
      </div>

      {value.key === "custom" ? (
        <div className="flex items-center gap-1.5 animate-in fade-in duration-200">
          <Input
            type="date"
            aria-label="From date"
            value={value.from}
            max={value.to}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="h-9 w-auto px-2.5 font-medium"
          />
          <span className="text-xs text-muted-soft">→</span>
          <Input
            type="date"
            aria-label="To date"
            value={value.to}
            min={value.from}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="h-9 w-auto px-2.5 font-medium"
          />
        </div>
      ) : null}
    </div>
  );
}

export function LiveBadge({ live, busy = false }: { live: boolean; busy?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wider uppercase transition-colors",
        live
          ? "border-primary/30 bg-soft-green text-primary"
          : "border-border/70 bg-card text-muted-foreground",
      )}
      title={
        live
          ? "Live updates connected via Supabase Realtime"
          : "Live updates unavailable — data refreshes manually"
      }
    >
      <span className="relative flex size-1.5">
        {live ? (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            live ? "bg-primary" : "bg-muted-soft",
          )}
        />
      </span>
      {busy ? "Syncing…" : live ? "Live" : "Manual"}
    </span>
  );
}
