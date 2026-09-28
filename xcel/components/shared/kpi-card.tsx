import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type KpiTone = "default" | "success" | "warning" | "info" | "danger";

const toneStyles: Record<
  KpiTone,
  { wrap: string; icon: string; value: string }
> = {
  default: {
    wrap: "border-border/70 bg-card",
    icon: "bg-soft-green text-primary",
    value: "text-foreground",
  },
  success: {
    wrap: "border-primary/20 bg-gradient-to-br from-very-soft-green to-card",
    icon: "bg-soft-green text-primary",
    value: "text-primary",
  },
  warning: {
    wrap: "border-warning/25 bg-gradient-to-br from-warning-soft/60 to-card",
    icon: "bg-warning-soft text-warning",
    value: "text-warning",
  },
  info: {
    wrap: "border-info/25 bg-gradient-to-br from-info-soft/70 to-card",
    icon: "bg-info-soft text-info",
    value: "text-info",
  },
  danger: {
    wrap: "border-danger/20 bg-gradient-to-br from-danger-soft/50 to-card",
    icon: "bg-danger-soft text-danger",
    value: "text-danger",
  },
};

export function KpiCard({
  label,
  value,
  supporting,
  trend,
  trendDirection,
  icon: Icon,
  tone = "default",
  live = false,
  pulse = false,
  className,
}: {
  label: string;
  value: string;
  supporting?: string;
  /** Pre-computed text like "+12.4% vs last week" */
  trend?: string;
  trendDirection?: "up" | "down";
  icon?: LucideIcon;
  tone?: KpiTone;
  /** Show a live connectivity dot next to the label */
  live?: boolean;
  /** Subtle ring pulse on the icon when live data refreshes */
  pulse?: boolean;
  className?: string;
}) {
  const t = toneStyles[tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border px-5 py-4 shadow-card transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-card-lg",
        "animate-in fade-in from-2 slide-in-from-bottom-1 duration-300",
        t.wrap,
        className,
      )}
    >
      {/* soft accent wash */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-60",
          tone === "success" && "bg-primary/25",
          tone === "warning" && "bg-warning/30",
          tone === "info" && "bg-info/30",
          tone === "danger" && "bg-danger/25",
          tone === "default" && "bg-muted",
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
              {label}
            </p>
            {live ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-primary"
                aria-label="Live"
                title="Live via Supabase Realtime"
              >
                <span className="block size-1.5 animate-ping rounded-full bg-primary/70" />
              </span>
            ) : null}
          </div>

          <p
            className={cn(
              "mt-1.5 text-xl leading-tight font-bold tracking-tight tabular-nums",
              "transition-transform duration-200",
              pulse && "animate-in zoom-in-95 duration-300",
              t.value,
            )}
            key={pulse ? value : undefined}
          >
            {value}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {supporting ? (
              <p className="text-xs font-medium text-slate-500 dark:text-muted-soft">{supporting}</p>
            ) : null}
            {trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase tabular-nums",
                  trendDirection === "down"
                    ? "bg-danger-soft text-danger"
                    : "bg-soft-green text-primary",
                )}
              >
                {trendDirection === "down" ? (
                  <ArrowDownRight className="size-3" />
                ) : (
                  <ArrowUpRight className="size-3" />
                )}
                {trend}
              </span>
            ) : null}
          </div>
        </div>

        {Icon ? (
          <div
            className={cn(
              "relative grid size-10 shrink-0 place-items-center rounded-xl",
              t.icon,
            )}
          >
            <Icon className="size-5" />
            {pulse ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl ring-2 ring-current opacity-0 animate-ping"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
