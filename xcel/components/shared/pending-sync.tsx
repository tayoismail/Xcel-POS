"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type PendingSyncContextValue = {
  /** navigator.onLine */
  online: boolean;
  /** Number of queued/failed mutations reported by any part of the app. */
  pendingCount: number;
  /** Report a mutation that is waiting to reach the server. */
  queueMutation: (label?: string) => void;
  /** Report a queued mutation as delivered. */
  resolveMutation: (label?: string) => void;
  /** Manually retry queued work (hook point for an outbox sync). */
  flush: () => void;
};

const PendingSyncContext = createContext<PendingSyncContextValue>({
  online: true,
  pendingCount: 0,
  queueMutation: () => {},
  resolveMutation: () => {},
  flush: () => {},
});

/**
 * App-wide offline / pending-sync state.
 * Tracks connectivity and a mutation queue count that any component or
 * server-action wrapper can bump via queueMutation/resolveMutation.
 */
export function PendingSyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const queueMutation = useCallback(() => setPendingCount((n) => n + 1), []);
  const resolveMutation = useCallback(
    () => setPendingCount((n) => Math.max(0, n - 1)),
    [],
  );
  const flush = useCallback(() => {
    // Hook point: replay an offline outbox here when one exists.
    setPendingCount(0);
  }, []);

  const value = useMemo(
    () => ({ online, pendingCount, queueMutation, resolveMutation, flush }),
    [online, pendingCount, queueMutation, resolveMutation, flush],
  );

  return <PendingSyncContext.Provider value={value}>{children}</PendingSyncContext.Provider>;
}

export function usePendingSync() {
  return useContext(PendingSyncContext);
}

/**
 * Floating bottom-right badge: appears when offline or when mutations are
 * queued, stays out of the way otherwise. Render once near the app root.
 */
export function PendingSyncIndicator({ className }: { className?: string }) {
  const { online, pendingCount } = usePendingSync();
  const pathname = usePathname();
  // The POS terminal renders its own flat, square-cornered indicator.
  const show = (!online || pendingCount > 0) && !pathname.startsWith("/pos");
  if (!show) return null;

  return (
    <div
      role="status"
      className={
        "fixed right-4 bottom-4 z-[60] inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-slate-500 shadow-card-lg animate-in fade-in slide-in-from-bottom-2 duration-200 bg-card dark:text-muted-foreground " +
        (className ?? "")
      }
      title={
        online
          ? "Changes queued — they will sync automatically"
          : "Offline — changes will sync when you reconnect"
      }
    >
      {online ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4 animate-pulse">
          <path d="M12 13v8" strokeLinecap="round" />
          <path d="M8 17l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16.5 6.5a5 5 0 0 0-9 0" strokeLinecap="round" />
          <path d="M4.6 10a7.5 7.5 0 0 1 14.8 0" strokeLinecap="round" opacity="0.6" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
          <path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" strokeLinecap="round" />
          <path d="M12 12v9" strokeLinecap="round" />
          <path d="M8 17l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {online
        ? `${pendingCount} pending sync`
        : `Offline${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`}
    </div>
  );
}
