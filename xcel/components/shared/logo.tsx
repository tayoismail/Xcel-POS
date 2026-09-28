import { cn } from "@/lib/utils";

/** The Xcel "X" glyph. */
export function XcelMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      className={cn("size-5", className)}
      aria-hidden
    >
      <path d="M6 5l12 14M18 5L6 19" />
    </svg>
  );
}

/** Rounded badge containing the Xcel mark. Size, radius and colour are overridable. */
export function XcelLogoMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-[42px] shrink-0 items-center justify-center rounded-lg bg-primary",
        className,
      )}
    >
      <XcelMark className={cn("text-white", iconClassName)} />
    </div>
  );
}
