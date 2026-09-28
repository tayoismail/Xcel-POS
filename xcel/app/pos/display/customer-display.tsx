"use client";

import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { formatCurrency as naira } from "@/lib/utils";

type DisplayState = {
  items: { name: string; qty: number; subtotal: number }[];
  total: number;
  businessName: string;
};

const EMPTY: DisplayState = { items: [], total: 0, businessName: "Xcel Phone World" };

export function CustomerDisplay() {
  const [state, setState] = useState<DisplayState>(EMPTY);

  useEffect(() => {
    const bc = new BroadcastChannel("xcel-pos-display");
    bc.onmessage = (e) => setState({ ...EMPTY, ...e.data });
    // Ask the POS tab for current state on open
    bc.postMessage({ type: "request" });
    return () => bc.close();
  }, []);

  return (
    <div className="pos-font grid min-h-svh place-items-center bg-card p-8 tracking-tight text-foreground">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-6 flex flex-col items-center gap-2">
          <h1 className="text-3xl leading-tight font-bold tracking-tight text-foreground">
            {state.businessName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Thank you for your purchase</p>
        </div>

        {state.items.length === 0 ? (
          <div className="mt-10 grid gap-2 text-muted-soft">
            <Banknote className="mx-auto size-16 text-muted-soft" strokeWidth={1.25} />
            <p className="text-xl">Welcome! Your sale will appear here.</p>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-2 text-left">
              {state.items.map((i, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3"
                >
                  <span className="text-lg">
                    <span className="font-bold text-primary">{i.qty} ×</span> {i.name}
                  </span>
                  <span className="text-lg font-bold tabular-nums">{naira(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-base font-bold text-foreground">Total payable</span>
              <span className="text-4xl leading-tight font-bold tracking-tight tabular-nums text-foreground">
                {naira(state.total)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
