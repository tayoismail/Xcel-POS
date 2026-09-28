"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Factory, Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";

import {
  listProductionLogsAction,
  logProductionAction,
  type ProductionLogRow,
} from "@/app/actions/production";
import { listLocationsAction } from "@/app/actions/stock";
import { searchPurchaseProductsAction } from "@/app/actions/purchases";
import { EmptyState, NoResultsState } from "@/components/shared/empty-state";
import { SearchInput } from "@/components/shared/search-input";
import { TablePagination } from "@/components/shared/table-pagination";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type LocationOption = { id: string; name: string };
type ProductOption = { id: string; name: string; sku: string };

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function ProductionManager() {
  const [rows, setRows] = useState<ProductionLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [product, setProduct] = useState<ProductOption | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      setLoading(true);
      try {
        const res = await listProductionLogsAction({
          search,
          page: opts?.page ?? page,
          pageSize,
        });
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
        setPageCount(res.pageCount);
      } catch {
        toast.error("Couldn't load production logs");
      } finally {
        setLoading(false);
      }
    },
    [search, page, pageSize],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void refresh({ page: 1 }), 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pageSize]);

  useEffect(() => {
    if (!dialogOpen) {
      setProductQuery("");
      setProductResults([]);
      setProduct(null);
      setQuantity("1");
      setNotes("");
      return;
    }
    void listLocationsAction()
      .then((locs) => {
        setLocations(locs);
        if (locs.length) setLocationId(locs[0].id);
      })
      .catch(() => toast.error("Couldn't load locations"));
    void searchPurchaseProductsAction("")
      .then(setProductResults)
      .catch(() => toast.error("Couldn't search products"));
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;
    if (productTimer.current) clearTimeout(productTimer.current);
    productTimer.current = setTimeout(() => {
      searchPurchaseProductsAction(productQuery)
        .then((rows) =>
          setProductResults(rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku }))),
        )
        .catch(() => toast.error("Couldn't search products"));
    }, 250);
    return () => {
      if (productTimer.current) clearTimeout(productTimer.current);
    };
  }, [productQuery, dialogOpen]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) {
      toast.error("Select a finished product");
      return;
    }
    if (!locationId) {
      toast.error("Select a location");
      return;
    }
    setSaving(true);
    try {
      const res = await logProductionAction({
        productId: product.id,
        locationId,
        quantity: Number(quantity),
        notes,
      });
      if (!res.ok) {
        toast.error("Couldn't log production", { description: res.error });
        return;
      }
      toast.success(`Logged ${quantity} × ${product.name}`, {
        description: "Stock increased with a PRODUCTION movement.",
      });
      setDialogOpen(false);
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  function clearFilters() {
    setSearch("");
  }
  const hasFilters = search !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search product, SKU or notes…"
          aria-label="Search production logs"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <Factory className="size-3.5" />
            {total} log{total === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            Log production
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden sm:table-cell">SKU</TableHead>
              <TableHead className="text-right">Qty built</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden lg:table-cell">Notes</TableHead>
              <TableHead className="hidden md:table-cell">Logged by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4">
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-10" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-4 w-36" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {row.sku}
                    </TableCell>
                    <TableCell className="text-right font-bold tabular-nums text-primary">
                      +{row.quantity}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {row.locationName ?? "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-56 truncate text-muted-foreground lg:table-cell">
                      {row.notes ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {row.createdByName}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          hasFilters ? (
            <NoResultsState description="No production logs match your search." onClear={clearFilters} />
          ) : (
            <EmptyState
              icon={Wrench}
              title="No production logged yet"
              description="Assemble phones or kits, log the run here, and finished stock increases automatically."
              actionLabel="Log production"
              onAction={() => setDialogOpen(true)}
            />
          )
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log production</DialogTitle>
            <DialogDescription>
              Record an assembly run — finished stock goes up with a PRODUCTION
              movement. Component (BOM) deduction is coming soon.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label>Finished product</Label>
              {product ? (
                <div className="flex items-center justify-between rounded-xl border border-border/70 bg-secondary/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-foreground">{product.name}</p>
                    <p className="font-mono text-xs text-slate-500 dark:text-muted-foreground">
                      {product.sku}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setProduct(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-soft" />
                  <Input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search product name or SKU…"
                    className="pl-9"
                    autoComplete="off"
                    aria-label="Search finished product"
                  />
                  <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border/70 bg-card">
                    {productResults.length === 0 ? (
                      <p className="px-3 py-2.5 text-sm text-slate-500 dark:text-muted-foreground">
                        No products found.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {productResults.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setProduct(p);
                                setProductQuery("");
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-secondary/60"
                            >
                              <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-foreground">
                                {p.name}
                              </span>
                              <span className="font-mono text-xs text-slate-500 dark:text-muted-foreground">
                                {p.sku}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="prod-qty">Quantity built</Label>
                <Input
                  id="prod-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="w-full" aria-label="Location">
                    <SelectValue placeholder="Location" />
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
            </div>

            <div className="grid gap-2">
              <Label htmlFor="prod-notes">Notes</Label>
              <Textarea
                id="prod-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Batch details, serials range, worker notes…"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !product}>
                {saving ? "Saving…" : "Log production"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
