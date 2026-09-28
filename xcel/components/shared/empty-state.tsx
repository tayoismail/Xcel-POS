import { PackageOpen, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-soft-green">
        <Icon className="size-6 text-primary" />
      </div>
      <div className="grid gap-1">
        <p className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm leading-normal text-slate-500 dark:text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button size="sm" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function NoResultsState({
  description,
  onClear,
}: {
  description?: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      icon={SearchX}
      title="No results found"
      description={
        description ?? "There are no records matching your current filters."
      }
      actionLabel={onClear ? "Clear filters" : undefined}
      onAction={onClear}
    />
  );
}
