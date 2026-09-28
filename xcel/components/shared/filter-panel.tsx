import { cn } from "@/lib/utils";

export function FilterPanel({
  title = "Filters",
  children,
  actions,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-5 shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">
          {title}
        </h2>
        {actions}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
