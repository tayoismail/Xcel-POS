import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-slate-900 dark:text-foreground transition-colors outline-none placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/30 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:bg-input/10 dark:placeholder:text-muted-soft/70",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
