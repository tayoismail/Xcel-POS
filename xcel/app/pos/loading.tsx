import { Skeleton } from "@/components/ui/skeleton";

export default function PosLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the POS terminal"
      className="flex h-svh w-full flex-col overflow-hidden bg-background"
    >
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid gap-1.5">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3.5 w-40" />
          </div>
        </div>
        <div className="hidden items-center gap-3 md:flex">
          <Skeleton className="h-9 w-44 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="hidden size-9 rounded-full sm:block" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
        <div className="hidden w-[46%] flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:flex">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
          <Skeleton className="mt-auto h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
