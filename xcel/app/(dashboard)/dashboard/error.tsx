"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div role="alert" className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-danger-soft">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8 text-danger"
            aria-hidden
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h2 className="text-2xl leading-tight font-bold tracking-tight text-slate-900 md:text-3xl dark:text-foreground">Something went wrong</h2>
        <p className="mt-3 text-sm leading-normal text-slate-500 dark:text-muted-foreground">
          The page hit an unexpected error. Your data is safe — try again, and if it
          keeps happening, note this code:{" "}
          <span className="font-mono text-xs text-muted-foreground">
            {error.digest ?? "n/a"}
          </span>
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
