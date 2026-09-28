"use client";

import { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  createLocationAction,
  createQuickStartProductsAction,
  type QuickStartProductInput,
} from "@/app/actions/onboarding";
import { XcelLogoMark } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Row = QuickStartProductInput & { key: number };

const EXAMPLES = [
  { name: "iPhone 12 Screen Assembly", price: "42000", costPrice: "31000", stock: "10" },
  { name: "20W Fast Charger (USB-C)", price: "12500", costPrice: "8000", stock: "25" },
  { name: "Tempered Glass Screen Protector", price: "2500", costPrice: "900", stock: "60" },
];

export function OnboardingWizard({
  businessName,
  userName,
  role,
  hasLocation,
  hasProducts,
}: {
  businessName: string;
  userName: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  hasLocation: boolean;
  hasProducts: boolean;
}) {
  const canManage = role !== "STAFF";

  // Step state: 1 = location, 2 = products, 3 = done
  const [step, setStep] = useState<1 | 2 | 3>(hasLocation ? 2 : 1);

  // Step 1 — location
  const [locName, setLocName] = useState("");
  const [locAddress, setLocAddress] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(hasLocation ? "existing" : null);

  // Step 2 — products
  const [rows, setRows] = useState<Row[]>(
    canManage
      ? [{ key: 0, name: "", sku: null, price: "", costPrice: "", stock: "" }]
      : [],
  );
  const [savingProducts, setSavingProducts] = useState(false);

  async function saveLocation() {
    setSavingLocation(true);
    try {
      const res = await createLocationAction({
        name: locName,
        address: locAddress,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Location added");
      setLocationId(res.id ?? null);
      setStep(2);
    } finally {
      setSavingLocation(false);
    }
  }

  async function saveProducts() {
    setSavingProducts(true);
    try {
      // Resolve which location receives the opening stock
      let targetLocationId = locationId;
      if (!targetLocationId || targetLocationId === "existing") {
        const loc = await fetch("/api/onboarding/location", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null);
        targetLocationId = loc?.locationId ?? null;
      }
      if (!targetLocationId) {
        toast.error("Add a location first");
        setStep(hasLocation ? 2 : 1);
        return;
      }
      const res = await createQuickStartProductsAction(
        targetLocationId,
        rows.map(({ name, sku, price, costPrice, stock }) => ({
          name,
          sku,
          price,
          costPrice,
          stock,
        })),
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `${res.result!.created} product${res.result!.created === 1 ? "" : "s"} ready${res.result!.skipped ? ` · ${res.result!.skipped} skipped` : ""}`,
      );
      setStep(3);
    } finally {
      setSavingProducts(false);
    }
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-background px-4 py-10">
      {/* Ambient accents */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 size-[480px] -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 size-72 rounded-full bg-soft-green blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <XcelLogoMark className="mx-auto mb-4" />
          <h1 className="text-2xl leading-tight font-bold tracking-tight text-slate-900 md:text-3xl dark:text-foreground">
            Welcome, {userName.split(" ")[0]} 👋
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Let&apos;s set up <span className="font-semibold text-foreground">{businessName}</span>{" "}
            — three quick steps and you&apos;re selling.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                s === step ? "w-10 bg-primary" : s < step ? "w-6 bg-primary/40" : "w-6 bg-muted",
              )}
            />
          ))}
        </div>

        <div className="card-premium p-6 sm:p-8">
          {/* ---------------------------------------------------- Step 1 */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-soft-green text-primary">
                  <Store className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Add your first location</h2>
                  <p className="text-sm leading-normal text-slate-500 dark:text-muted-foreground">
                    Where you sell from — a shop, kiosk or branch.
                  </p>
                </div>
              </div>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="loc-name">Location name</Label>
                  <Input
                    id="loc-name"
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                    placeholder="e.g. Main Shop — Ikeja"
                    autoFocus
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="loc-address">Address (optional)</Label>
                  <Input
                    id="loc-address"
                    value={locAddress}
                    onChange={(e) => setLocAddress(e.target.value)}
                    placeholder="12 Computer Village Road, Ikeja, Lagos"
                  />
                </div>
                <Button
                  size="lg"
                  className="mt-1 w-full"
                  disabled={!locName.trim() || savingLocation}
                  onClick={() => void saveLocation()}
                >
                  {savingLocation ? <Loader2 className="size-4 animate-spin" /> : null}
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
                {hasLocation && (
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    Skip — locations already exist
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- Step 2 */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-soft-green text-primary">
                  <Plus className="size-5" />
                </span>
                <div>
                  <h2 className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">Add your first products</h2>
                  <p className="text-sm leading-normal text-slate-500 dark:text-muted-foreground">
                    Opening stock is recorded automatically. You can add more later.
                  </p>
                </div>
              </div>

              {canManage ? (
                <>
                  <div className="grid gap-2.5">
                    {rows.map((r, idx) => (
                      <div
                        key={r.key}
                        className="grid grid-cols-[1fr_84px_84px_84px_32px] items-center gap-2"
                      >
                        <Input
                          value={r.name}
                          onChange={(e) => updateRow(r.key, { name: e.target.value })}
                          placeholder={idx === 0 ? "Product name (e.g. iPhone 13 Screen)" : "Product name"}
                          aria-label={`Product ${idx + 1} name`}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={r.price}
                          onChange={(e) => updateRow(r.key, { price: e.target.value })}
                          placeholder="Price"
                          aria-label={`Product ${idx + 1} price`}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={r.costPrice}
                          onChange={(e) => updateRow(r.key, { costPrice: e.target.value })}
                          placeholder="Cost"
                          aria-label={`Product ${idx + 1} cost price`}
                        />
                        <Input
                          type="number"
                          min={0}
                          value={r.stock}
                          onChange={(e) => updateRow(r.key, { stock: e.target.value })}
                          placeholder="Stock"
                          aria-label={`Product ${idx + 1} opening stock`}
                        />
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                          disabled={rows.length === 1}
                          className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                          aria-label={`Remove product ${idx + 1}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setRows((prev) => [
                          ...prev,
                          { key: Date.now(), name: "", sku: null, price: "", costPrice: "", stock: "" },
                        ])
                      }
                    >
                      <Plus className="size-4" />
                      Add row
                    </Button>
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary hover:underline"
                      onClick={() =>
                        setRows(
                          EXAMPLES.map((e, i) => ({
                            key: i,
                            name: e.name,
                            sku: null,
                            price: e.price,
                            costPrice: e.costPrice,
                            stock: e.stock,
                          })),
                        )
                      }
                    >
                      Use sample products
                    </button>
                  </div>

                  <Button
                    size="lg"
                    className="mt-5 w-full"
                    disabled={savingProducts || rows.every((r) => !r.name.trim())}
                    onClick={() => void saveProducts()}
                  >
                    {savingProducts ? <Loader2 className="size-4 animate-spin" /> : null}
                    Finish setup
                    <ArrowRight className="size-4" />
                  </Button>
                </>
              ) : (
                <div className="rounded-xl bg-secondary/60 p-4 text-sm leading-normal text-slate-500 dark:text-muted-foreground">
                  Your account can&apos;t create products. Ask your manager to add the
                  catalog, then start selling from the POS.
                </div>
              )}

              {hasProducts && (
                <Button variant="ghost" className="mt-2 w-full" onClick={() => setStep(3)}>
                  Skip — products already exist
                </Button>
              )}
            </div>
          )}

          {/* ---------------------------------------------------- Step 3 */}
          {step === 3 && (
            <div className="animate-in fade-in zoom-in-95 text-center duration-300">
              <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-soft-green">
                <CheckCircle2 className="size-8 text-primary" />
              </div>
              <h2 className="text-lg leading-tight font-semibold tracking-tight text-slate-900 dark:text-foreground">You&apos;re all set!</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-normal text-slate-500 dark:text-muted-foreground">
                {businessName} is ready. Open the POS terminal to make your first sale —
                it takes less than a minute.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button size="lg" asChild>
                  <a href="/pos">
                    Open POS terminal
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="/dashboard">Go to dashboard</a>
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs font-medium text-slate-500 dark:text-muted-soft">
          Step {step} of 3 · You can change all of this later in settings
        </p>
      </div>
    </main>
  );
}
