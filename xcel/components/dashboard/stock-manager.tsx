"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Barcode,
  PackageOpen,
  Plus,
  SlidersHorizontal,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";

import {
  adjustStockAction,
  listLocationsAction,
  listStockLevelsAction,
  listMovementsAction,
  type MovementRow,
  type StockLevelRow,
  type StockStatusFilter,
} from "@/app/actions/stock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { TablePagination } from "@/components/shared/table-pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MOVEMENT_TYPES = [
  "ALL",
  "PURCHASE",
  "ADJUSTMENT",
  "PRODUCTION",
  "RETURN",
  "TRANSFER",
  "SALE",
] as const;

function stockColor(qty: number, alertAt: number) {
  if (qty <= 0) return "text-danger";
  if (qty <= alertAt) return "text-warning";
  return "text-primary";
}

function stockStatusLabel(qty: number, alertAt: number) {
  if (qty < 0) return { label: "Negative", variant: "destructive" as const };
  if (qty === 0) return { label: "Out", variant: "destructive" as const };
  if (qty <= alertAt) return { label: "Low", variant: "outline" as const };
  return { label: "Healthy", variant: "secondary" as const };
}

type Locations = Awaited<ReturnType<typeof listLocationsAction>>;

export function StockManager({
  userRole,
}: {
  userRole: "OWNER" | "MANAGER" | "STAFF";
}) {
  return (
    <Tabs defaultValue="levels" className="gap-4">
      <TabsList>
        <TabsTrigger value="levels">Levels</TabsTrigger>
        <TabsTrigger value="movements">Movements</TabsTrigger>
      </TabsList>
      <TabsContent value="levels">
        <LevelsTab userRole={userRole} />
      </TabsContent>
      <TabsContent value="movements">
        <MovementsTab />
      </TabsContent>
    </Tabs>
  );
}

/* ------------------------------------------------------------- LEVELS -- */

function LevelsTab({ userRole }: { userRole: "OWNER" | "MANAGER" | "STAFF" }) {
  const [rows, setRows] = useState<StockLevelRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StockStatusFilter>("ALL");
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<StockLevelRow | null>(null);
  const [, startTransition] = useTransition();
  const isManager = userRole === "OWNER" || userRole === "MANAGER";
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh(opts?: {
    search?: string;
    status?: StockStatusFilter;
    page?: number;
  }) {
    setLoading(true);
    try {
      const res = await listStockLevelsAction({
        search: opts?.search ?? search,
        status: opts?.status ?? status,
        page: opts?.page ?? page,
        pageSize,
      });
      setRows(res.rows);
      setTotal(res.total);
      setPageCount(res.pageCount);
      setPage(res.page);
      setLowStockCount(res.lowStockCount);
    } catch {
      toast.error("Couldn't load stock levels", { description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refresh({ page: 1 }), 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, pageSize]);

  function openAdjust(row: StockLevelRow | null) {
    setAdjustProduct(row);
    setAdjustOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Low-stock alert banner */}
      {lowStockCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3.5 shadow-card">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <p className="text-sm leading-normal">
            <span className="font-bold text-warning">
              {lowStockCount} low-stock alert{lowStockCount > 1 ? "s" : ""}
            </span>{" "}
            <span className="text-muted-foreground">
              — products at or below their alert threshold.
            </span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setStatus("LOW");
              setSearch("");
            }}
          >
            View low stock
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search product, SKU or barcode…"
          aria-label="Search stock"
        />
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as StockStatusFilter)}
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by stock status">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All stock</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="OUT">Out</SelectItem>
            <SelectItem value="NEGATIVE">Negative</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isManager && (
            <>
              <Button variant="outline" size="sm" onClick={() => openAdjust(null)}>
                <Barcode className="size-4" />
                Scan to restock
              </Button>
              <Button size="sm" onClick={() => openAdjust(null)}>
                <Plus className="size-4" />
                Adjust stock
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Product</TableHead>
              <TableHead className="hidden md:table-cell">ID</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead className="text-right">Current stock</TableHead>
              <TableHead className="hidden xl:table-cell text-right">Alert at</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Adjust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
              : (rows ?? []).map((row) => {
                  const level = stockStatusLabel(row.quantity, row.alertAt);
                  return (
                    <TableRow key={`${row.productId}-${row.locationId}`}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-3">
                          <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted">
                            {row.imageUrl ? (
                              <Image
                                src={row.imageUrl}
                                alt=""
                                fill
                                sizes="36px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="grid size-full place-items-center text-[10px] font-medium text-muted-foreground">
                                {row.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="max-w-52 truncate font-medium">
                            {row.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {row.productId.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {row.locationName}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("text-sm font-semibold tabular-nums", stockColor(row.quantity, row.alertAt))}>
                          {row.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums xl:table-cell">
                        {row.alertAt}
                      </TableCell>
                      <TableCell>
                        <Badge variant={level.variant}>{level.label}</Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {isManager && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openAdjust(row)}
                          >
                            Adjust
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          <EmptyState
            icon={PackageOpen}
            title="No stock records found"
            description={
              search || status !== "ALL"
                ? "Try a different search or filter."
                : "Receive a purchase or adjust stock to create records."
            }
          />
        )}

        {rows && rows.length > 0 && (
          <TablePagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPrevious={() => void refresh({ page: page - 1 })}
            onNext={() => void refresh({ page: page + 1 })}
          />
        )}
      </div>

      <AdjustStockDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        preselected={adjustProduct}
        userRole={userRole}
        onSaved={() =>
          startTransition(() => {
            void refresh();
          })
        }
      />
    </div>
  );
}

/* -------------------------------------------------- ADJUST STOCK DIALOG */

function AdjustStockDialog({
  open,
  onOpenChange,
  preselected,
  userRole,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselected: StockLevelRow | null;
  userRole: "OWNER" | "MANAGER" | "STAFF";
  onSaved: () => void;
}) {
  const [locations, setLocations] = useState<Locations>([]);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("1");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [reason, setReason] = useState("ADJUSTMENT");
  const [notes, setNotes] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<StockLevelRow[]>([]);
  const [saving, setSaving] = useState(false);
  const isManager = userRole === "OWNER" || userRole === "MANAGER";
  const signedQty = direction === "in" ? Math.abs(Number(qty) || 0) : -Math.abs(Number(qty) || 0);

  useEffect(() => {
    if (open) {
      void listLocationsAction().then((locs) => {
        setLocations(locs);
        if (locs[0]) setLocationId((prev) => prev || locs[0].id);
      });
      if (preselected) {
        setProductId(preselected.productId);
        setLocationId(preselected.locationId);
        setSearch(preselected.name);
      } else {
        setProductId("");
        setSearch("");
      }
      setQty("1");
      setDirection("in");
      setReason("ADJUSTMENT");
      setNotes("");
      setAllowNegative(false);
    }
  }, [open, preselected]);

  // Product search inside the dialog
  useEffect(() => {
    if (!open || preselected) return;
    const t = setTimeout(() => {
      void listStockLevelsAction({ search, page: 1, pageSize: 8 }).then((res) =>
        setOptions(res.rows),
      );
    }, 200);
    return () => clearTimeout(t);
  }, [search, open, preselected]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !locationId) {
      toast.error("Pick a product and a location");
      return;
    }
    if (!Number(qty)) {
      toast.error("Quantity must be a non-zero number");
      return;
    }
    setSaving(true);
    try {
      const res = await adjustStockAction({
        productId,
        locationId,
        quantity: signedQty,
        reason: reason as "ADJUSTMENT",
        notes: notes.trim() || null,
        allowNegative,
      });
      if (!res.ok) {
        toast.error("Adjustment failed", { description: res.error });
        return;
      }
      toast.success(
        `Stock ${signedQty > 0 ? "increased" : "reduced"} by ${Math.abs(signedQty)}`,
        { description: `New quantity: ${res.newQuantity}` },
      );
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Changes are logged as a stock movement with your name attached.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label>Product</Label>
            {preselected ? (
              <Input value={preselected.name} disabled />
            ) : (
              <div className="grid gap-1.5">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Scan barcode or search product…"
                  autoFocus
                />
                {options.length > 0 && (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-border/60">
                    {options.map((o) => (
                      <button
                        key={`${o.productId}-${o.locationId}`}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => {
                          setProductId(o.productId);
                          setLocationId(o.locationId);
                          setSearch(`${o.name} · ${o.locationName}`);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{o.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.sku} · {o.locationName}
                          </span>
                        </span>
                        <span className={cn("text-xs font-semibold tabular-nums", stockColor(o.quantity, o.alertAt))}>
                          {o.quantity}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Location</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  <SelectItem value="PURCHASE">Purchase</SelectItem>
                  <SelectItem value="RETURN">Return</SelectItem>
                  <SelectItem value="PRODUCTION">Production</SelectItem>
                  <SelectItem value="TRANSFER">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="grid gap-2">
              <Label>Direction</Label>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant={direction === "in" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setDirection("in")}
                >
                  <ArrowUpRight className="size-4" />
                  In
                </Button>
                <Button
                  type="button"
                  variant={direction === "out" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setDirection("out")}
                >
                  <ArrowDownRight className="size-4" />
                  Out
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adj-qty">Quantity</Label>
              <Input
                id="adj-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="adj-notes">Notes</Label>
            <Input
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context for this adjustment"
            />
          </div>

          {isManager && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/40 p-3.5">
              <div className="grid gap-0.5">
                <Label htmlFor="allow-neg" className="text-sm">
                  Force allow negative
                </Label>
                <p className="text-xs text-muted-foreground">
                  Let this adjustment push stock below zero.
                </p>
              </div>
              <Switch
                id="allow-neg"
                checked={allowNegative}
                onCheckedChange={setAllowNegative}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              Apply adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------- MOVEMENTS -- */

function MovementsTab() {
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("ALL");
  const [locationId, setLocationId] = useState<string>("ALL");
  const [locations, setLocations] = useState<Locations>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listLocationsAction().then(setLocations).catch(() => toast.error("Couldn't load locations"));
  }, []);

  async function refresh(opts?: { page?: number }) {
    setLoading(true);
    try {
      const res = await listMovementsAction({
        search,
        type: type as "ALL",
        locationId,
        page: opts?.page ?? page,
        pageSize,
      });
      setRows(res.rows);
      setTotal(res.total);
      setPageCount(res.pageCount);
      setPage(res.page);
    } catch {
      toast.error("Couldn't load movements", { description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refresh({ page: 1 }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, locationId, pageSize]);

  const typeBadge: Record<string, { variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info"; className?: string }> = {
    PURCHASE: { variant: "default" },
    SALE: { variant: "info" },
    RETURN: { variant: "outline" },
    ADJUSTMENT: { variant: "outline" },
    PRODUCTION: { variant: "secondary" },
    TRANSFER: { variant: "warning" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search product, SKU, notes or reference…"
          aria-label="Search movements"
        />
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by movement type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOVEMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === "ALL" ? "All types" : t.charAt(0) + t.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by location">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Product</TableHead>
              <TableHead className="hidden lg:table-cell">Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="hidden md:table-cell">By</TableHead>
              <TableHead className="hidden xl:table-cell">Notes</TableHead>
              <TableHead className="pr-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} movements />)
              : (rows ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4">
                      <div className="grid leading-tight">
                        <span className="max-w-56 truncate font-medium">{m.productName}</span>
                        <span className="font-mono text-xs text-muted-foreground">{m.sku}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {m.locationName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeBadge[m.type]?.variant ?? "outline"} className={typeBadge[m.type]?.className}>
                        {m.type.charAt(0) + m.type.slice(1).toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", m.quantity >= 0 ? "text-primary" : "text-danger")}>
                        {m.quantity >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {m.createdByName}
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate text-muted-foreground xl:table-cell">
                      {m.notes ?? "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString("en-NG", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          <EmptyState
            icon={ScanLine}
            title="No movements yet"
            description="Stock changes from sales, purchases and adjustments appear here in order."
          />
        )}

        {rows && rows.length > 0 && (
          <TablePagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPrevious={() => void refresh({ page: page - 1 })}
            onNext={() => void refresh({ page: page + 1 })}
          />
        )}
      </div>
    </div>
  );
}

function RowSkeleton({ movements }: { movements?: boolean }) {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <div className="flex items-center gap-3">
          {movements ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            <>
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-4 w-36" />
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-12" />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Skeleton className="h-4 w-24" />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Skeleton className="h-4 w-28" />
      </TableCell>
      <TableCell className="pr-4 text-right">
        <Skeleton className="ml-auto h-4 w-20" />
      </TableCell>
    </TableRow>
  );
}
