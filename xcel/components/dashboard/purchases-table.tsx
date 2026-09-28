"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers, PackageCheck, Plus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import {
  listPurchasesAction,
  receivePurchaseAction,
  type PurchaseCounts,
  type PurchasePaymentFilter,
  type PurchaseRow,
} from "@/app/actions/purchases";
import { listLocationsAction } from "@/app/actions/stock";
import { PurchaseFormDialog } from "@/components/dashboard/purchase-form-dialog";
import { payStatusBadge } from "@/components/dashboard/sale-detail-drawer";
import { EmptyState, NoResultsState } from "@/components/shared/empty-state";
import { FilterChips } from "@/components/shared/filter-chip";
import { SearchInput } from "@/components/shared/search-input";
import { TablePagination } from "@/components/shared/table-pagination";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn, formatCurrency as naira } from "@/lib/utils";

type LocationOption = { id: string; name: string };
type StatusChip = "ALL" | "PENDING" | "RECEIVED";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const purchaseStatusBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  RECEIVED: { label: "Received", variant: "default" },
};

export function PurchasesTable() {
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState<PurchaseCounts>({
    all: 0,
    pending: 0,
    received: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusChip>("ALL");
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentFilter>("ALL");
  const [locationId, setLocationId] = useState("ALL");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogMode, setDialogMode] = useState<"single" | "bulk" | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRow | null>(null);
  const [busy, setBusy] = useState(false);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      setLoading(true);
      try {
        const res = await listPurchasesAction({
          search,
          status,
          paymentStatus,
          locationId,
          page: opts?.page ?? page,
          pageSize,
        });
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
        setPageCount(res.pageCount);
        setCounts(res.counts);
      } catch {
        toast.error("Couldn't load purchases", { description: "Please try again." });
      } finally {
        setLoading(false);
      }
    },
    [search, status, paymentStatus, locationId, page, pageSize],
  );

  useEffect(() => {
    void listLocationsAction().then(setLocations).catch(() => toast.error("Couldn't load locations"));
  }, []);

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
  }, [search, status, paymentStatus, locationId, pageSize]);

  async function confirmReceive() {
    if (!receiveTarget || busy) return;
    setBusy(true);
    try {
      const res = await receivePurchaseAction(receiveTarget.id);
      if (!res.ok) {
        toast.error("Receive failed", { description: res.error });
      } else {
        toast.success(`${receiveTarget.referenceNo} received`, {
          description: "Stock levels updated with PURCHASE movements.",
        });
        void refresh();
      }
      setReceiveTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
    setPaymentStatus("ALL");
    setLocationId("ALL");
  }

  const hasFilters =
    search !== "" || status !== "ALL" || paymentStatus !== "ALL" || locationId !== "ALL";

  const statusChips: { key: StatusChip; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "PENDING", label: "Pending", count: counts.pending },
    { key: "RECEIVED", label: "Received", count: counts.received },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search reference, supplier, staff or product…"
          aria-label="Search purchases"
        />
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by location">
            <SelectValue placeholder="Location" />
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
        <Select
          value={paymentStatus}
          onValueChange={(v) => setPaymentStatus(v as PurchasePaymentFilter)}
        >
          <SelectTrigger className="w-[140px]" aria-label="Filter by payment status">
            <SelectValue placeholder="Payment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All payments</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PARTIAL">Partial</SelectItem>
            <SelectItem value="UNPAID">Unpaid</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <ShoppingCart className="size-3.5" />
            {total} purchase{total === 1 ? "" : "s"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setDialogMode("bulk")}>
            <Layers className="size-4" />
            Bulk add
          </Button>
          <Button size="sm" onClick={() => setDialogMode("single")}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Purchase status chips with counts */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips options={statusChips} value={status} onChange={setStatus} />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Reference</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="hidden xl:table-cell">Location</TableHead>
              <TableHead className="hidden sm:table-cell">Supplier</TableHead>
              <TableHead>Purchase status</TableHead>
              <TableHead className="hidden md:table-cell">Payment status</TableHead>
              <TableHead className="text-right">Grand total</TableHead>
              <TableHead className="text-right">Payment due</TableHead>
              <TableHead className="hidden lg:table-cell">Added by</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Skeleton className="ml-auto h-8 w-20 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => {
                  const pay = payStatusBadge[row.paymentStatus];
                  const st = purchaseStatusBadge[row.status];
                  const due = Number(row.paymentDue);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4">
                        <span className="font-mono text-sm font-semibold tracking-tight">
                          {row.referenceNo}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(row.date)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">
                        {row.locationName}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate sm:table-cell">
                        {row.supplierName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st?.variant ?? "outline"}>
                          {st?.label ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={pay?.variant ?? "outline"}>
                          {pay?.label ?? row.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {naira(row.grandTotal)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          due > 0 ? "text-danger" : "text-muted-foreground",
                        )}
                      >
                        {naira(row.paymentDue)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {row.addedByName}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {row.status === "PENDING" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReceiveTarget(row)}
                          >
                            <PackageCheck className="size-4" />
                            Receive
                          </Button>
                        ) : (
                          <span className="text-xs font-medium text-muted-soft">
                            In stock
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          hasFilters ? (
            <NoResultsState
              description="No purchases match your current search or filters."
              onClear={clearFilters}
            />
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="No purchases yet"
              description="Record a supplier purchase, then receive it to push stock into your location."
              actionLabel="+ Add purchase"
              onAction={() => setDialogMode("single")}
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

      {/* Create dialog (single + bulk) */}
      <PurchaseFormDialog
        open={dialogMode !== null}
        onOpenChange={(o) => {
          if (!o) setDialogMode(null);
        }}
        mode={dialogMode ?? "single"}
        onSaved={() => void refresh()}
      />

      {/* Receive confirm */}
      <AlertDialog
        open={!!receiveTarget}
        onOpenChange={(o) => !o && setReceiveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Receive {receiveTarget?.referenceNo}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stock levels will increase and PURCHASE movements recorded for
              each item at {receiveTarget?.locationName}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void confirmReceive()}>
              {busy ? "Receiving…" : "Receive stock"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
