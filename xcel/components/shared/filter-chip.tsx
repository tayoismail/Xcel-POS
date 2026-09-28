import { cn } from "@/lib/utils";

export type FilterChipOption<T extends string> = {
  key: T;
  label: string;
  count?: number;
};

/**
 * Status filter pills with counts — shared by the invoice, purchase,
 * quotation and POS-sale tables so the control stays identical everywhere.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {options.map((chip) => {
        const active = chip.key === value;
        return (
          <button
            key={chip.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(chip.key)}
            className={cn(
              "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-all",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-card"
                : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {chip.label}
            {chip.count !== undefined ? (
              <span
                className={cn(
                  "grid min-w-5 place-items-center rounded-full px-1 text-xs font-bold tabular-nums",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {chip.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
