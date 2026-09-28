"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPrevious,
  onNext,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/70 px-4 py-3.5",
        className,
      )}
    >
      <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
        {total === 0
          ? "No records"
          : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={onPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 text-xs font-medium tabular-nums text-slate-500 dark:text-muted-foreground">
          Page {page} of {Math.max(pageCount, 1)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pageCount}
          onClick={onNext}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
