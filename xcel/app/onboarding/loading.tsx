import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading setup"
      className="grid min-h-svh place-items-center bg-background px-4 py-10"
    >
      <div className="w-full max-w-xl">
        <Skeleton className="mx-auto mb-6 size-[52px] rounded-[14px]" />
        <div className="card-premium p-6 sm:p-8">
          <div className="grid gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <div className="mt-6 flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-2 flex-1 rounded-full" />
            ))}
          </div>
          <div className="mt-6 grid gap-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="mt-6 flex justify-between gap-2">
            <Skeleton className="h-10 w-24 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
