"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Barcode,
  Box,
  ChevronDown,
  CloudOff,
  CloudUpload,
  LogOut,
  Minus,
  Monitor,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency as naira } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  checkoutAction,
  posListCategoriesAction,
  posSearchCustomersAction,
  posSearchProductsAction,
  getReceiptAction,
  type PosProduct,
  type ReceiptData,
} from "@/app/actions/pos";

type CartLine = {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  qty: number;
  /** Signed per-line adjustment: > 0 = overcharge, < 0 = discount. */
  adjust: number;
  stock: number;
  alertAt: number;
  imageUrl: string | null;
};

type CustomerOption = { id: string; name: string; phone: string | null; type: string };
type Category = { id: string; name: string };

type PaymentKind = "CASH" | "TRANSFER" | "POS" | "CREDIT" | "SPLIT";

export function PosClient({
  user,
  locations,
  businessName,
}: {
  user: { name: string; role: "OWNER" | "MANAGER" | "STAFF" };
  locations: { id: string; name: string }[];
  businessName: string;
  currency: string;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");

  // ------------------------------------------------------------- state
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [overallDiscount, setOverallDiscount] = useState("");
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [payDialog, setPayDialog] = useState<PaymentKind | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<{ productId: string; name: string; value: string } | null>(null);
  const [success, setSuccess] = useState<ReceiptData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [allowNegative, setAllowNegative] = useState(false);
  const [pane, setPane] = useState<"cart" | "products">("products");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const isManager = user.role === "OWNER" || user.role === "MANAGER";
  const forceNegative = isManager && allowNegative;
  const searchRef = useRef<HTMLInputElement>(null);
  const lastLoadErrorToast = useRef(0);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const displayChannel = useRef<BroadcastChannel | null>(null);

  const focusSearch = useCallback(() => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    (isDesktop ? searchRef.current : mobileSearchRef.current)?.focus();
  }, []);

  // --------------------------------------------------------- data load
  const loadProducts = useCallback(
    async (search: string, categoryId: string, locId: string) => {
      setProductsLoading(true);
      try {
        const rows = await posSearchProductsAction({ search, categoryId, locationId: locId || undefined });
        setProducts(rows);
        setOnline(true);
      } catch {
        setOnline(false);
        setPendingSync((n) => n + 1);
        const stamp = Date.now();
        if (stamp - lastLoadErrorToast.current > 5000) {
          lastLoadErrorToast.current = stamp;
          toast.error("Couldn't load products — check your connection.");
        }
      } finally {
        setProductsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void posListCategoriesAction()
      .then(setCategories)
      .catch(() => {
        setOnline(false);
        toast.error("Couldn't load product categories.");
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadProducts(productSearch, activeCategory, locationId);
    }, 200);
    return () => clearTimeout(t);
  }, [productSearch, activeCategory, locationId, loadProducts]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      searchRef.current?.focus();
    }
  }, []);

  // Clock (client-only to avoid hydration mismatch)
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setPendingSync(0);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ------------------------------------------------- cart manipulation
  const addToCart = useCallback(
    (p: PosProduct) => {
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === p.id);
        const inCart = existing?.qty ?? 0;
        if (inCart + 1 > p.stock && !isManager) {
          toast.warning(p.stock <= 0 ? `${p.name} is out of stock` : `Only ${p.stock} left of ${p.name}`);
          return prev;
        }
        if (inCart + 1 > p.stock && isManager) {
          // Managers may over-sell — checkout requires “Allow negative stock”.
          toast.warning(`${p.name} exceeds stock — tick “Allow negative stock” when paying`);
        }
        if (existing) {
          return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
        }
        return [
          ...prev,
          {
            productId: p.id,
            name: p.name,
            sku: p.sku,
            unitPrice: Number(p.price),
            qty: 1,
            adjust: 0,
            stock: p.stock,
            alertAt: p.alertAt,
            imageUrl: p.imageUrl,
          },
        ];
      });
      setPane("cart");
    },
    [isManager],
  );

  function setQty(productId: string, qty: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const max = l.stock;
        const nextQty = Math.max(1, isManager ? qty : Math.min(qty, max));
        if (qty > max && !isManager) toast.warning(`Only ${max} in stock`);
        const adjust = Math.max(l.adjust, -l.unitPrice * nextQty);
        return { ...l, qty: nextQty, adjust };
      }),
    );
  }

  function setLineAdjust(productId: string, value: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, adjust: Math.max(value, -l.unitPrice * l.qty) }
          : l,
      ),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  // ------------------------------------------------------------- totals
  const totals = useMemo(() => {
    const gross = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const overcharges = cart.reduce((s, l) => s + Math.max(0, l.adjust), 0);
    const lineDiscounts = cart.reduce((s, l) => s + Math.max(0, -l.adjust), 0);
    const charges = gross + overcharges;
    const maxOverall = Math.max(0, charges - lineDiscounts);
    const overall = Math.min(Math.max(0, Number(overallDiscount) || 0), maxOverall);
    const discount = lineDiscounts + overall;
    const total = Math.max(0, charges - discount);
    const items = cart.reduce((s, l) => s + l.qty, 0);
    return { gross, overcharges, lineDiscounts, overall, discount, charges, total, items };
  }, [cart, overallDiscount]);

  // Broadcast cart to the customer display (second screen)
  useEffect(() => {
    displayChannel.current = new BroadcastChannel("xcel-pos-display");
    const channel = displayChannel.current;
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (!displayChannel.current) return;
    displayChannel.current.postMessage({
      items: cart.map((l) => ({
        name: l.name,
        qty: l.qty,
        subtotal: l.unitPrice * l.qty + l.adjust,
      })),
      total: totals.total,
      businessName,
    });
  }, [cart, totals.total, businessName]);

  // -------------------------------------------------------- customer ui
  useEffect(() => {
    if (!customerOpen) return;
    const t = setTimeout(() => {
      void posSearchCustomersAction(customerQuery)
        .then(setCustomerResults)
        .catch(() => {
          /* transient network issue — keep previous results */
        });
    }, 150);
    return () => clearTimeout(t);
  }, [customerQuery, customerOpen]);

  // ------------------------------------------------------- payment flow
  async function completeSale(
    kind: PaymentKind,
    parts: { method: PaymentKind; amount: number; provider?: string | null }[],
  ) {
    const paidTotal = parts.reduce((s, p) => s + p.amount, 0);
    if (paidTotal + 0.001 < totals.total && kind !== "CREDIT") {
      toast.error("Payments don't cover the total");
      return;
    }
    if (paidTotal > totals.total + 0.001) {
      toast.error("Payments exceed the total payable", {
        description: "Reduce a payment amount before completing the sale.",
      });
      return;
    }
    setProcessing(true);
    try {
      const res = await checkoutAction({
        locationId,
        customerId: customer?.id ?? null,
        items: cart.map((l) => ({
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitPrice: l.unitPrice.toFixed(2),
          discount: Math.max(0, -l.adjust).toFixed(2),
          overcharge: Math.max(0, l.adjust).toFixed(2),
        })),
        overallDiscount: totals.overall.toFixed(2),
        paymentMethod: kind,
        payments: parts.map((p) => ({ method: p.method, amount: p.amount.toFixed(2), provider: p.provider ?? null })),
        allowNegative: forceNegative,
      });
      if (!res.ok) {
        if (!online) setPendingSync((n) => n + 1);
        toast.error("Checkout failed", { description: res.error });
        return;
      }
      const receiptRes = await getReceiptAction(res.saleId!);
      setSuccess(receiptRes.ok ? receiptRes.receipt : null);
      toast.success("Sale completed", {
        description: receiptRes.ok ? `${receiptRes.receipt.invoiceNo} · ${naira(Number(receiptRes.receipt.totals.total))}` : undefined,
      });
      setCart([]);
      setOverallDiscount("");
      setCustomer(null);
      setCustomerQuery("");
      setAllowNegative(false);
      setPayDialog(null);
      void loadProducts(productSearch, activeCategory, locationId); // refresh stock
    } catch (err) {
      // Network failure / action threw — never leave the dialog stuck silently
      if (!online) setPendingSync((n) => n + 1);
      toast.error("Checkout failed", {
        description: err instanceof Error ? err.message : "Network error — check your connection.",
      });
    } finally {
      setProcessing(false);
    }
  }

  // -------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (success) {
        if (e.key === "Enter") setSuccess(null);
        return;
      }
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;

      if (e.key === "Escape") {
        setCustomerOpen(false);
        if (payDialog) setPayDialog(null);
        if (adjustTarget) setAdjustTarget(null);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        focusSearch();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0 && !payDialog) setPayDialog("CASH");
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (cart.length > 0 && !payDialog) setPayDialog("CREDIT");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (cart.length > 0 && !payDialog) setPayDialog("SPLIT");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cart.length, success, payDialog, adjustTarget, focusSearch]);

  // --------------------------------------------------------- render: ok
  if (success) {
    return (
      <SuccessScreen
        receipt={success}
        businessName={businessName}
        onClose={() => setSuccess(null)}
      />
    );
  }

  const nowText = now
    ? `${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, ${now.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" })}`
    : "";

  const searchBox = (inputRef: React.RefObject<HTMLInputElement | null>) => (
    <div className="relative flex-1">
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-soft" />
      <input
        ref={inputRef}
        value={productSearch}
        onChange={(e) => setProductSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && products.length > 0) {
            addToCart(products[0]);
            setProductSearch("");
          }
        }}
        placeholder="Enter product name / SKU / code"
        className="h-10 w-full rounded-lg border border-border bg-card pr-9 pl-9 text-sm text-slate-900 dark:text-foreground outline-none placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
        aria-label="Search products"
      />
      <Barcode className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-soft" />
    </div>
  );

  return (
    <div className="pos-font flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* ================================================ 2. TOP HEADER */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
        {/* Left */}
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-background"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-slate-900 md:text-3xl dark:text-foreground">POS</h1>
            <p className="mt-1 text-sm leading-normal text-slate-500 dark:text-muted-foreground">
              Select products for sales
            </p>
          </div>
        </div>

        {/* Center */}
        <div className="hidden items-center gap-3 md:flex">
          <div className="relative">
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-9 appearance-none rounded-full border border-border bg-background pr-8 pl-4 text-sm font-medium text-slate-900 dark:text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
              aria-label="Location"
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <span className="text-xs font-medium whitespace-nowrap text-slate-500 tabular-nums dark:text-muted-foreground">{nowText}</span>
        </div>

        {/* Right */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => window.open("/pos/display", "_blank", "width=800,height=600")}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-background dark:text-foreground"
          >
            <Monitor className="size-4" />
            <span className="hidden sm:inline">Customer screen</span>
          </button>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-background dark:text-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Exit POS</span>
          </Link>
        </div>
      </header>

      {/* Mobile pane toggle */}
      <div className="mx-4 mb-2 flex shrink-0 gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setPane("products")}
          className={
            "h-10 flex-1 rounded-lg text-sm font-semibold " +
            (pane === "products"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground")
          }
        >
          Products
        </button>
        <button
          type="button"
          onClick={() => setPane("cart")}
          className={
            "h-10 flex-1 rounded-lg text-sm font-semibold " +
            (pane === "cart"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground")
          }
        >
          Cart{totals.items > 0 ? ` (${totals.items})` : ""}
        </button>
      </div>

      {/* =========================================== 4. MAIN CONTENT */}
      <div className="flex min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {/* ------------------------------------- A. LEFT: cart (~46%) */}
        <div
          className={
            "flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card lg:mr-5 lg:w-[54%] lg:flex-none " +
            (pane === "cart" ? "w-full" : "hidden lg:flex")
          }
        >
          {/* Search row — split equally across the cart column width */}
          <div className="shrink-0 border-b border-border p-4">
            <div className="flex gap-4">
              {/* Customer */}
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">Customer</p>
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-soft" />
                  <input
                    className="h-10 w-full rounded-lg border border-border bg-card px-3 pl-9 text-sm text-slate-900 dark:text-foreground outline-none placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
                    placeholder="Walk-In Customer"
                    value={
                      customer
                        ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`
                        : customerQuery
                    }
                    onChange={(e) => {
                      setCustomer(null);
                      setCustomerQuery(e.target.value);
                      setCustomerOpen(true);
                    }}
                    onFocus={() => setCustomerOpen(true)}
                    onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                    aria-label="Customer"
                  />
                  {customerOpen && customerResults.length > 0 && (
                    <div className="absolute inset-x-0 top-full z-20 mt-1 divide-y divide-border rounded-lg border border-border bg-card shadow-card">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-900 hover:bg-background dark:text-foreground"
                          onClick={() => {
                            setCustomer(c);
                            setCustomerQuery(c.name);
                            setCustomerOpen(false);
                          }}
                        >
                          <span>{c.name}</span>
                          <span className="text-xs text-muted-soft">
                            {c.type === "WALK_IN" ? "Walk-in" : c.phone}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Product search */}
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="mb-1 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-muted-foreground">Product search</p>
                {searchBox(searchRef)}
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_104px_100px_28px] items-center gap-3 border-b border-border px-4 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span>Product / Service</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Subtotal</span>
            <span />
          </div>

          {/* Cart rows */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="mt-10 text-center">
                <ShoppingBag className="mx-auto size-10 text-muted-soft" strokeWidth={1.25} />
                <p className="mt-2 text-sm text-slate-500 dark:text-muted-soft">Cart is empty</p>
                <p className="mt-1 text-xs text-muted-soft">
                  Tap a product or scan a barcode to add items
                </p>
                <p className="mt-4 text-xs text-muted-soft">
                  Shortcuts: / search · Enter add · F2 cash · F3 credit · F4 split
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cart.map((l) => {
                  const lineTotal = l.unitPrice * l.qty + l.adjust;
                  return (
                    <div
                      key={l.productId}
                      className="grid grid-cols-[minmax(0,1fr)_116px_100px_40px] items-center gap-3 px-4 py-3.5"
                    >
                      {/* Left: name + meta (tap to adjust) */}
                      <button
                        type="button"
                        onClick={() =>
                          setAdjustTarget({
                            productId: l.productId,
                            name: l.name,
                            value: String(l.adjust || ""),
                          })
                        }
                        className="min-w-0 text-left"
                        title="Tap to adjust (discount or extra charge)"
                      >
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">{l.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {naira(l.unitPrice)} each · {l.sku} ·{" "}
                          <span className={l.adjust !== 0 ? "font-medium text-primary" : ""}>
                            tap to adjust{l.adjust !== 0 ? ` (${l.adjust > 0 ? "+" : ""}${l.adjust})` : ""}
                          </span>
                        </p>
                      </button>

                      {/* Center: qty controls */}
                      <div className="flex items-center justify-center">
                        <div className="flex items-center rounded-md border border-border">
                          <button
                            type="button"
                            onClick={() => setQty(l.productId, l.qty - 1)}
                            aria-label="Decrease"
                            className="grid size-9 cursor-pointer place-items-center text-foreground hover:bg-background"
                          >
                            <Minus className="size-4" />
                          </button>
                          <span className="w-9 border-x border-border py-2 text-center text-sm font-semibold tabular-nums">
                            {l.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQty(l.productId, l.qty + 1)}
                            aria-label="Increase"
                            className="grid size-9 cursor-pointer place-items-center text-foreground hover:bg-background"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      </div>

                      {/* Right: subtotal */}
                      <span className="text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-foreground">
                        {naira(lineTotal)}
                      </span>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeLine(l.productId)}
                        aria-label={`Remove ${l.name}`}
                        className="grid size-9 cursor-pointer place-items-center justify-self-center rounded-md text-muted-soft transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart footer */}
          <div className="shrink-0 border-t border-border px-4 pt-4 pb-3">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-muted-foreground">
              <span>Items: {totals.items}</span>
              <span>Subtotal: {naira(totals.charges)}</span>
            </div>
            <p className="mt-0.5 text-xs font-normal text-muted-foreground italic">
              Tap a product to add discount
            </p>
            <div className="mt-2 flex items-baseline justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-foreground">Total payable</p>
              <p className="text-[30px] leading-none font-bold tracking-tight tabular-nums text-foreground">
                {naira(totals.total)}
              </p>
            </div>
          </div>

          {/* Payment actions */}
          <div className="grid shrink-0 grid-cols-2 gap-2.5 px-4 pb-4 sm:grid-cols-4">
            <button
              type="button"
              disabled={processing || cart.length === 0}
              onClick={() => setPayDialog("CASH")}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cash
            </button>
            <button
              type="button"
              disabled={processing || cart.length === 0}
              onClick={() => setPayDialog("SPLIT")}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-secondary-foreground text-sm font-semibold text-background transition-colors hover:bg-[color-mix(in_oklab,var(--secondary-foreground)_88%,black)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Multiple pay
            </button>
            <button
              type="button"
              disabled={processing || cart.length === 0}
              onClick={() => setPayDialog("CREDIT")}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-warning text-sm font-semibold text-background transition-colors hover:bg-[color-mix(in_oklab,var(--warning)_88%,black)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Credit sale
            </button>
            <button
              type="button"
              disabled={processing || cart.length === 0}
              onClick={() => setConfirmCancel(true)}
              className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-semibold text-danger transition-colors hover:border-danger/40 hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>

        {/* ---------------------------------- B. RIGHT: products (~54%) */}
        <div
          className={
            "flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-card " +
            (pane === "products" ? "flex" : "hidden lg:flex")
          }
        >
          {/* Mobile product search — cart pane holds the desktop pair */}
          <div className="shrink-0 border-b border-border p-4 lg:hidden">
            {searchBox(mobileSearchRef)}
          </div>

          {/* Panel header */}
          <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-lg font-semibold text-foreground">Products</h2>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
              {productsLoading ? "…" : products.length}
            </span>
          </div>

          {/* Category pills */}
          <div className="scrollbar-thin flex shrink-0 flex-wrap gap-2 px-4 pb-3">
            <CategoryPill active={activeCategory === "ALL"} onClick={() => setActiveCategory("ALL")}>
              All Categories
            </CategoryPill>
            {categories.map((c) => (
              <CategoryPill
                key={c.id}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
              >
                {c.name}
              </CategoryPill>
            ))}
          </div>

          {/* Product grid */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {productsLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="size-9 animate-pulse rounded-full bg-emerald-50" />
                    <div className="h-3.5 w-4/5 animate-pulse rounded bg-secondary" />
                    <div className="h-3.5 w-3/5 animate-pulse rounded bg-secondary" />
                    <div className="h-3 w-2/5 animate-pulse rounded bg-secondary" />
                  </div>
                ))}
              </div>
            ) : (
              <div key={`${activeCategory}-${productSearch}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {products.map((p) => {
                  const out = p.stock <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-border bg-card p-4 text-center transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={out && !forceNegative}
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="mb-2.5 size-10 rounded-full object-cover"
                        />
                      ) : (
                        <span className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                          <Box className="size-6" strokeWidth={1.5} />
                        </span>
                      )}
                      <p className="line-clamp-2 text-sm leading-tight font-medium text-slate-900 dark:text-foreground">
                        {p.name}
                      </p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-primary">
                        {naira(Number(p.price))}
                      </p>
                      <p className={"mt-1 text-xs " + (out ? "text-danger" : "text-muted-soft")}>
                        {out ? "Out of stock" : `Stock ${p.stock}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            {!productsLoading && products.length === 0 && (
              <div className="mt-10 text-center text-sm text-slate-500 dark:text-muted-soft">
                No products match — try another search or category.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================= 8. FLOATING BADGE */}
      {(!online || pendingSync > 0) && (
        <div
          className="fixed right-5 bottom-5 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-slate-500 shadow-card dark:text-muted-foreground"
          title={online ? "Changes queued — will sync automatically" : "Offline — check your connection"}
        >
          {online ? (
            <CloudUpload className="size-4 text-muted-foreground" />
          ) : (
            <CloudOff className="size-4 text-muted-foreground" />
          )}
          {online
            ? `${pendingSync} pending sync`
            : `Offline${pendingSync > 0 ? ` · ${pendingSync} pending sync` : ""}`}
        </div>
      )}

      {/* Payment dialogs */}
      {payDialog && (
        <PayDialog
          kind={payDialog}
          total={totals.total}
          processing={processing}
          isManager={isManager}
          allowNegative={allowNegative}
          onAllowNegativeChange={setAllowNegative}
          onClose={() => {
            // Don't let the manager toggle leak to the next sale
            setAllowNegative(false);
            setPayDialog(null);
          }}
          onComplete={completeSale}
        />
      )}

      {/* Line adjust dialog */}
      {adjustTarget && (
        <AdjustDialog
          name={adjustTarget.name}
          value={adjustTarget.value}
          onChange={(v) => setAdjustTarget({ ...adjustTarget, value: v })}
          onClose={() => setAdjustTarget(null)}
          onSave={() => {
            setLineAdjust(adjustTarget.productId, Number(adjustTarget.value) || 0);
            setAdjustTarget(null);
          }}
        />
      )}

      {/* Cancel cart confirmation */}
      <AlertDialog open={confirmCancel} onOpenChange={(o) => !o && setConfirmCancel(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this sale?</AlertDialogTitle>
            <AlertDialogDescription>
              {cart.length} item{cart.length === 1 ? "" : "s"} will be removed from the cart. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep cart</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={() => {
                setCart([]);
                setConfirmCancel(false);
                toast.info("Sale cancelled");
              }}
            >
              Cancel sale
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

function CategoryPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "h-8 shrink-0 cursor-pointer rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors " +
        (active
          ? "border border-transparent bg-primary text-primary-foreground"
          : "border border-border bg-card text-foreground hover:bg-background")
      }
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------- pay dialog */

type SplitRow = {
  id: number;
  method: "CASH" | "TRANSFER" | "POS";
  provider: string;
  amount: string;
};

const TRANSFER_PROVIDERS = ["Opay", "Kuda", "Moniepoint", "GTBank", "Zenith Bank", "Access Bank", "First Bank", "UBA"];
const POS_PROVIDERS = ["Moniepoint", "PalmPay", "Opay POS", "Nomba", "Itex"];

/**
 * Format a raw amount string (as typed) with thousands separators for display,
 * e.g. "19500.5" -> "19,500.5". Returns the input untouched when it isn't a
 * plain number, so in-progress typing like "1,2" or "12." is never mangled.
 */
function formatAmountInput(raw: string): string {
  if (!/^[\d.]+$/.test(raw)) return raw;
  const [whole, ...rest] = raw.split(".");
  const wholeFmt = whole ? Number(whole).toLocaleString("en-US") : "";
  return rest.length > 0 ? `${wholeFmt}.${rest.join("")}` : wholeFmt;
}

/** Display value for an amount field: digits/commas only, formatted when safe. */
function amountDisplay(raw: string): string {
  const cleaned = raw.replace(/,/g, "");
  return /^[\d.]*$/.test(cleaned) ? formatAmountInput(cleaned) : raw;
}

function PayDialog({
  kind,
  total,
  processing,
  isManager,
  allowNegative,
  onAllowNegativeChange,
  onClose,
  onComplete,
}: {
  kind: PaymentKind;
  total: number;
  processing: boolean;
  isManager: boolean;
  allowNegative: boolean;
  onAllowNegativeChange: (v: boolean) => void;
  onClose: () => void;
  onComplete: (
    kind: PaymentKind,
    parts: { method: PaymentKind; amount: number; provider?: string | null }[],
  ) => void;
}) {
  const isCredit = kind === "CREDIT";
  const isSplit = kind === "SPLIT";
  const [cash, setCash] = useState(isSplit ? "" : total.toFixed(2));
  const [splits, setSplits] = useState<SplitRow[]>([
    { id: 1, method: "TRANSFER", provider: TRANSFER_PROVIDERS[0], amount: "" },
  ]);
  const nextSplitId = useRef(2);

  function addSplit() {
    setSplits((prev) => [...prev, { id: nextSplitId.current++, method: "CASH", provider: "", amount: "" }]);
  }
  function removeSplit(id: number) {
    setSplits((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  }
  /** Store the comma-free value; the input renders it with separators. */
  function updateSplitAmount(id: number, raw: string) {
    updateSplit(id, { amount: raw.replace(/,/g, "") });
  }
  function updateSplit(id: number, patch: Partial<SplitRow>) {
    setSplits((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...patch };
        if (patch.method) {
          next.provider =
            patch.method === "CASH" ? "" : patch.method === "POS" ? POS_PROVIDERS[0] : TRANSFER_PROVIDERS[0];
        }
        return next;
      }),
    );
  }

  const parts: { method: PaymentKind; amount: number; provider: string | null }[] = isSplit
    ? splits
        .map((s) => ({
          method: s.method,
          amount: Number(s.amount) || 0,
          provider: s.method === "CASH" ? null : s.provider || null,
        }))
        .filter((p) => p.amount > 0)
    : [{ method: "CASH" as const, amount: Number(cash) || 0, provider: null }].filter((p) => p.amount > 0);
  const paid = parts.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, total - paid);
  const creditAmount = isCredit ? total : Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="pos-font max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-pay-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <h3 id="pos-pay-title" className="text-xl font-bold tracking-tight text-foreground">
            {isCredit ? "Credit sale" : isSplit ? "Multiple payment" : "Cash payment"}
          </h3>
          <div className="flex items-start gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total payable</p>
              <p className="text-xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-foreground">
                {naira(total)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close payment"
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        </div>

        {/* Sub-header */}
        <p className="mt-1 text-sm text-muted-foreground">
          {isCredit
            ? "Record the full amount as credit for the selected customer."
            : isSplit
              ? "Split this sale across cash, transfer, POS, or more."
              : "The full amount will be recorded as a cash payment."}
        </p>

        {isSplit ? (
          <>
            {/* Section header */}
            <div className="mt-6 flex items-center justify-between">
              <h4 className="text-base font-semibold text-foreground">Split payment</h4>
              <button
                type="button"
                onClick={addSplit}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-background"
              >
                <Plus className="size-3.5" />
                Add part
              </button>
            </div>

            {/* Payment rows — method · provider · amount · delete, one per line */}
            <div className="mt-4 flex flex-col gap-3">
              {splits.map((s) => (
                <div key={s.id} className="flex w-full items-center gap-3">
                  {/* Method */}
                  <div className="relative w-1/4 shrink-0">
                    <select
                      value={s.method}
                      aria-label="Payment method"
                      onChange={(e) => updateSplit(s.id, { method: e.target.value as SplitRow["method"] })}
                      className="w-full cursor-pointer appearance-none rounded-md border border-input bg-card px-3 py-2 pr-8 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
                    >
                      <option value="CASH">Cash</option>
                      <option value="TRANSFER">Bank transfer</option>
                      <option value="POS">POS</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-soft" />
                  </div>

                  {/* Provider */}
                  <div className="relative w-1/4 shrink-0">
                    {s.method === "CASH" ? (
                      <div className="flex h-[38px] items-center rounded-md border border-border bg-background px-3 text-sm text-muted-soft">
                        Cash
                      </div>
                    ) : (
                      <>
                        <select
                          value={s.provider}
                          aria-label="Payment provider"
                          onChange={(e) => updateSplit(s.id, { provider: e.target.value })}
                          className="w-full cursor-pointer appearance-none rounded-md border border-input bg-card px-3 py-2 pr-8 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
                        >
                          {(s.method === "POS" ? POS_PROVIDERS : TRANSFER_PROVIDERS).map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-soft" />
                      </>
                    )}
                  </div>

                  {/* Amount — right-aligned, thousands separators as you type */}
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Amount"
                    value={amountDisplay(s.amount)}
                    onChange={(e) => updateSplitAmount(s.id, e.target.value)}
                    className="h-[38px] min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-right text-sm tabular-nums text-foreground outline-none placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15"
                  />

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => removeSplit(s.id)}
                    aria-label="Remove part"
                    disabled={splits.length === 1}
                    className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Status */}
            <p className="mt-4 text-xs text-muted-soft">
              Paid {naira(paid)} of {naira(total)}{" \u00B7 "}
              {paid > 0 && paid >= total - 0.001 ? (
                <span className="font-medium text-primary">Settled</span>
              ) : (
                <span className="font-medium text-warning">{naira(remaining)} remaining</span>
              )}
            </p>
          </>
        ) : (
          <div className="mt-6 grid gap-3">
            <MoneyInput
              label="Cash received"
              value={cash}
              onChange={setCash}
              disabled={isCredit}
              action={
                !isCredit ? (
                  <button
                    type="button"
                    onClick={() => setCash(total.toFixed(2))}
                    className="cursor-pointer rounded-lg border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-background"
                  >
                    Exact
                  </button>
                ) : undefined
              }
            />
            {!isCredit && change > 0 && (
              <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">Change due</span>
                <span className="font-semibold tabular-nums text-primary">{naira(change)}</span>
              </div>
            )}
            {(isCredit || remaining > 0) && (
              <div className="flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">{isCredit ? "On credit" : "Unpaid balance"}</span>
                <span className="font-semibold tabular-nums text-warning">{naira(creditAmount)}</span>
              </div>
            )}
          </div>
        )}

        {isManager && (
          <label className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allowNegative}
              onChange={(e) => onAllowNegativeChange(e.target.checked)}
              className="size-3 accent-primary"
            />
            Allow negative stock
          </label>
        )}

        {/* Actions — bottom right */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="cursor-pointer rounded-md border border-input bg-card px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            disabled={processing || (!isCredit && paid <= 0)}
            onClick={() => onComplete(kind, isCredit ? [] : parts)}
            className="cursor-pointer rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground opacity-90 transition-all hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? "Recording..." : isCredit ? "Record credit sale" : "Complete sale"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
  disabled,
  action,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-muted-foreground">
        {label}
        {action}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0.00"
        value={amountDisplay(value)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
        className="h-10 rounded-lg border border-border bg-card px-3 text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-foreground outline-none placeholder:text-muted-soft focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:bg-background disabled:text-muted-soft"
      />
    </label>
  );
}

/* -------------------------------------------------- adjust dialog */

function AdjustDialog({
  name,
  value,
  onChange,
  onClose,
  onSave,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const num = Number(value) || 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="pos-font w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-adjust-title"
      >
        <h3 id="pos-adjust-title" className="text-base font-semibold tracking-tight text-foreground">Adjust line</h3>
        <p className="mt-0.5 mb-3 truncate text-xs text-slate-500 dark:text-muted-foreground">{name}</p>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-muted-foreground">
            Extra charge (₦) — use a negative number for a discount
          </span>
          <input
            type="number"
            value={value}
            autoFocus
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSave();
              }
            }}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-slate-900 dark:text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Adjustment amount"
          />
        </label>
        <div className="mt-2 flex justify-between rounded-lg bg-background px-3 py-2 text-sm">
          <span className="text-muted-foreground">Effect</span>
          <span
            className={
              "font-semibold tabular-nums " +
              (num > 0 ? "text-warning" : num < 0 ? "text-danger" : "text-muted-foreground")
            }
          >
            {num > 0 ? `+${naira(num)}` : num < 0 ? `−${naira(-num)}` : naira(0)}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 cursor-pointer rounded-lg border border-border bg-card text-sm font-semibold text-slate-900 hover:bg-background dark:text-foreground"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-11 cursor-pointer rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------- success screen */

function SuccessScreen({
  receipt,
  businessName,
  onClose,
}: {
  receipt: ReceiptData | null;
  businessName: string;
  onClose: () => void;
}) {
  return (
    <div className="pos-font grid h-screen w-full place-items-center overflow-y-auto bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-center shadow-card">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h2 className="text-xl leading-tight font-bold tracking-tight text-slate-900 dark:text-foreground">Sale complete</h2>
        {receipt && (
          <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
            {naira(Number(receipt.totals.total))} · {receipt.invoiceNo}
          </p>
        )}

        {receipt && (
          <div className="receipt-print mt-4 max-h-[45svh] overflow-y-auto rounded-lg border border-border bg-card p-4 text-left font-mono text-xs text-foreground">
            <p className="text-center text-sm font-bold">{businessName}</p>
            <p className="text-center text-muted-foreground">{receipt.locationName}</p>
            <p className="mt-2 text-muted-foreground">
              {receipt.invoiceNo} · {new Date(receipt.createdAt).toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              Cashier: {receipt.cashierName} · Customer: {receipt.customerName}
            </p>
            <hr className="my-2 border-border" />
            {receipt.items.map((i, idx) => (
              <div key={idx} className="flex justify-between gap-2 py-0.5">
                <span className="min-w-0 truncate">{i.qty} × {i.name}</span>
                <span className="tabular-nums">{naira(Number(i.subtotal))}</span>
              </div>
            ))}
            <hr className="my-2 border-border" />
            <div className="flex justify-between font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{naira(Number(receipt.totals.total))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paid ({receipt.paymentMethod})</span>
              <span className="tabular-nums">{naira(Number(receipt.totals.paid))}</span>
            </div>
            {Number(receipt.totals.due) > 0 && (
              <div className="flex justify-between text-danger">
                <span>DUE</span>
                <span className="tabular-nums">{naira(Number(receipt.totals.due))}</span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-11 cursor-pointer rounded-lg border border-border bg-card text-sm font-semibold text-slate-900 hover:bg-background dark:text-foreground"
          >
            Print receipt
          </button>
          {receipt && (
            <button
              type="button"
              onClick={() => window.open(`/api/receipts/${receipt.saleId}/pdf`, "_blank")}
              className="h-11 cursor-pointer rounded-lg border border-border bg-card text-sm font-semibold text-slate-900 hover:bg-background dark:text-foreground"
            >
              PDF
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="col-span-2 h-11 cursor-pointer rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-[color-mix(in_oklab,var(--primary)_88%,black)]"
          >
            New sale (Enter)
          </button>
        </div>
      </div>
    </div>
  );
}
