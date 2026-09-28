"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects the enclosing form's pending state, so
 * one-click actions (sign out, exports) can't be fired twice.
 */
export function PendingSubmitButton({
  pendingLabel,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
      {...props}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
