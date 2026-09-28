import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[10px] font-bold whitespace-nowrap tracking-wider uppercase transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-soft-green text-soft-green-foreground dark:bg-primary/15 [a]:hover:bg-primary/90 [a]:hover:text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/70",
        destructive:
          "bg-danger-soft text-danger focus-visible:ring-danger/20 dark:bg-danger/15 dark:text-danger [a]:hover:bg-danger/20",
        outline:
          "border-border text-secondary-foreground [a]:hover:bg-secondary [a]:hover:text-secondary-foreground",
        ghost: "hover:bg-secondary hover:text-secondary-foreground dark:hover:bg-muted/50",
        warning: "bg-warning-soft text-warning-foreground dark:bg-warning/15",
        info: "bg-info-soft text-info",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
