"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  MoreVertical,
  Pencil,
  Printer,
  Receipt,
  RotateCcw,
  ScanBarcode,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteSaleAction,
  listSalesAction,
  listSalespeopleAction,
  markRefundedAction,
  type SaleCounts,
  type SaleRow,
  type SalespersonOption,
} from "@/app/actions/sales";
import { getReceiptAction, type ReceiptData } from "@/app/actions/pos";
import { SaleDetailDrawer, methodBadge, payStatusBadge, saleStatusBadge } from "@/components/dashboard/sale-detail-drawer";
import { SaleEditDialog } from "@/components/dashboard/sale-edit-dialog";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState, NoResultsState } from "@/components/shared/empty-state";
import { FilterChips } from "@/components/shared/filter-chip";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

type StatusChip = "ALL" | "PAID" | "PARTIAL" | "UNPAID";

export function PosSalesTable({
  userRole,
  businessId,
}: {
  userRole: "OWNER" | "MANAGER" | "STAFF";
  businessId: string;
}) {
  const router = useRouter();
  const isManager = userRole === "OWNER" || userRole === "MANAGER";

  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState<SaleCounts>({ all: 0, paid: 0, partial: 0, unpaid: 0 });
  const [search, setSearch] = useState("");
  const [soldById, setSoldById] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState<StatusChip>("ALL");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "TRANSFER" | "SPLIT" | "CREDIT" | "POS" | "ALL"
  >("ALL");
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);

  // Row actions
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSaleId, setDrawerSaleId] = useState<string | null>(null);
  const [drawerRefresh, setDrawerRefresh] = useState(0);
  const [editSale, setEditSale] = useState<SaleRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [refundTarget, setRefundTarget] = useState<SaleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SaleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [printData, setPrintData] = useState<ReceiptData | null>(null);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest in-flight response may write state.
  const refreshSeq = useRef(0);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      const seq = ++refreshSeq.current;
      setLoading(true);
      try {
        const res = await listSalesAction({
          search,
          soldById,
          paymentStatus,
          paymentMethod,
          page: opts?.page ?? page,
          pageSize,
        });
        if (seq !== refreshSeq.current) return; // superseded by a newer request
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
        setPageCount(res.pageCount);
        setCounts(res.counts);
      } catch {
        if (seq === refreshSeq.current) {
          toast.error("Couldn't load sales", { description: "Please try again." });
        }
      } finally {
        if (seq === refreshSeq.current) setLoading(false);
      }
    },
    [search, soldById, paymentStatus, paymentMethod, page, pageSize],
  );

  // Keep a ref so the realtime handler always calls the latest refresh
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Initial loads
  useEffect(() => {
    void listSalespeopleAction().then(setSalespeople).catch(() => toast.error("Couldn't load salespeople"));
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced reload on filter changes
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
  }, [search, soldById, paymentStatus, paymentMethod, pageSize]);

  // ------------------------------------------------ Supabase Realtime
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
    } catch {
      setLive(false);
      return;
    }

    const channel = supabase.channel(`pos-sales-${businessId}`);
    const onChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void refreshRef.current(), 600);
    };

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "Sale", filter: `businessId=eq.${businessId}` },
      onChange,
    );
    // No Payment channel: Payment has no businessId to filter on, and every
    // payment worth reacting to arrives with a Sale row change anyway.
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      setLive(false);
      void supabase?.removeChannel(channel);
    };
  }, [businessId]);

  // ---------------------------------------------------------- printing
  useEffect(() => {
    if (!printData) return;
    const done = () => setPrintData(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printData]);

  async function printSale(saleId: string) {
    try {
      const res = await getReceiptAction(saleId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPrintData(res.receipt);
    } catch {
      toast.error("Couldn't load receipt");
    }
  }

  function openDrawer(saleId: string) {
    setDrawerSaleId(saleId);
    setDrawerOpen(true);
  }

  async function confirmRefund() {
    if (!refundTarget || busy) return;
    setBusy(true);
    try {
      const res = await markRefundedAction(refundTarget.id);
      if (!res.ok) {
        toast.error("Refund failed", { description: res.error });
      } else {
        toast.success(`${refundTarget.invoiceNo} marked as refunded`);
        setDrawerRefresh((n) => n + 1);
        void refresh();
      }
      setRefundTarget(null);
    } catch {
      toast.error("Refund failed", { description: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      const res = await deleteSaleAction(deleteTarget.id);
      if (!res.ok) {
        toast.error("Delete failed", { description: res.error });
      } else {
        toast.success(`${deleteTarget.invoiceNo} deleted`);
        if (drawerSaleId === deleteTarget.id) setDrawerOpen(false);
        void refresh();
      }
      setDeleteTarget(null);
    } catch {
      toast.error("Delete failed", { description: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setSoldById("ALL");
    setPaymentStatus("ALL");
    setPaymentMethod("ALL");
  }

  const hasFilters = search !== "" || soldById !== "ALL" || paymentStatus !== "ALL" || paymentMethod !== "ALL";

  const statusChips: { key: StatusChip; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "PAID", label: "Paid", count: counts.paid },
    { key: "PARTIAL", label: "Partial", count: counts.partial },
    { key: "UNPAID", label: "Unpaid", count: counts.unpaid },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search invoice, customer, staff or product…"
          aria-label="Search sales"
        />
        <Select value={soldById} onValueChange={setSoldById}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by staff">
            <SelectValue placeholder="Sold by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All staff</SelectItem>
            {salespeople.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={paymentMethod}
          onValueChange={(v) =>
            setPaymentMethod(v as typeof paymentMethod)
          }
        >
          <SelectTrigger className="w-[150px]" aria-label="Filter by pay method">
            <SelectValue placeholder="Pay method" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All methods</SelectItem>
            <SelectItem value="CASH">Cash</SelectItem>
            <SelectItem value="TRANSFER">Transfer</SelectItem>
            <SelectItem value="POS">POS</SelectItem>
            <SelectItem value="CREDIT">Credit</SelectItem>
            <SelectItem value="SPLIT">Split</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <Receipt className="size-3.5" />
            {total} sale{total === 1 ? "" : "s"}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1.5 text-xs font-medium text-slate-500 dark:text-muted-foreground",
            )}
            title={live ? "Live updates connected via Supabase Realtime" : "Live updates unavailable"}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                live ? "animate-pulse bg-primary" : "bg-muted-soft",
              )}
            />
            {live ? "Live" : "Manual"}
          </span>
        </div>
      </div>

      {/* Payment status chips with counts */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips options={statusChips} value={paymentStatus} onChange={setPaymentStatus} />
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
              <TableHead className="pl-4">Invoice</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden xl:table-cell text-center">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Paid</TableHead>
              <TableHead className="hidden lg:table-cell text-right">Due</TableHead>
              <TableHead className="hidden md:table-cell">Method</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead className="hidden xl:table-cell">Status</TableHead>
              <TableHead>Sold by</TableHead>
              <TableHead className="hidden 2xl:table-cell">Location</TableHead>
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
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Skeleton className="mx-auto h-4 w-8" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      <Skeleton className="ml-auto h-4 w-14" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Skeleton className="h-5 w-18 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden 2xl:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => {
                  const method = methodBadge[row.paymentMethod];
                  const pay = payStatusBadge[row.paymentStatus];
                  const status = saleStatusBadge[row.status];
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => openDrawer(row.id)}
                    >
                      <TableCell className="pl-4">
                        <span className="font-mono text-sm font-semibold tracking-tight">
                          {row.invoiceNo}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate sm:table-cell">
                        {row.customerName ?? (
                          <span className="text-muted-foreground">Walk-in</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums xl:table-cell">
                        {row.itemsCount}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {naira(row.totalAmount)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums lg:table-cell">
                        {naira(row.totalPaid)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden text-right font-semibold tabular-nums lg:table-cell",
                          Number(row.due) > 0 ? "text-danger" : "text-muted-foreground",
                        )}
                      >
                        {naira(row.due)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant={method?.variant ?? "outline"}>
                          {method?.label ?? row.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={pay?.variant ?? "outline"}>{pay?.label ?? row.paymentStatus}</Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {row.status === "COMPLETED" ? (
                          <Badge variant="outline">Completed</Badge>
                        ) : (
                          <Badge variant={status?.variant ?? "outline"}>{status?.label ?? row.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.soldByName}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground 2xl:table-cell">
                        {row.locationName}
                      </TableCell>
                      <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${row.invoiceNo}`}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {isManager && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditSale(row);
                                  setEditOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {isManager && row.status === "COMPLETED" && (
                              <DropdownMenuItem onClick={() => setRefundTarget(row)}>
                                <RotateCcw className="size-4" />
                                Mark refunded
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => void printSale(row.id)}>
                              <Printer className="size-4" />
                              Print receipt
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDrawer(row.id)}>
                              <FileText className="size-4" />
                              Open invoices
                            </DropdownMenuItem>
                            {isManager && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  <Trash2 className="size-4" />
                                  Delete sale
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          hasFilters ? (
            <NoResultsState
              description="No sales match your current search or filters."
              onClear={clearFilters}
            />
          ) : (
            <EmptyState
              icon={ScanBarcode}
              title="No sales yet"
              description="Completed checkouts from the POS terminal will appear here in real time."
              actionLabel="Open POS terminal"
              onAction={() => router.push("/pos")}
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

      {/* Detail drawer */}
      <SaleDetailDrawer
        saleId={drawerSaleId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        refreshKey={drawerRefresh}
        onPrint={(id) => void printSale(id)}
      />

      {/* Edit dialog */}
      <SaleEditDialog
        sale={editSale}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setDrawerRefresh((n) => n + 1);
          void refresh();
        }}
      />

      {/* Refund confirm */}
      <AlertDialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {refundTarget?.invoiceNo} as refunded?</AlertDialogTitle>
            <AlertDialogDescription>
              Items will be restocked and RETURN movements recorded. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void confirmRefund()}>
              {busy ? "Refunding…" : "Mark refunded"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.invoiceNo}?</AlertDialogTitle>
            <AlertDialogDescription>
              The sale, its payments and items will be removed. Stock is restocked unless
              already refunded. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Off-screen printable receipt */}
      {printData && (
        <div
          className="receipt-print fixed top-0 -left-[9999px] w-[360px] bg-white p-6 font-mono text-xs text-black"
          aria-hidden
        >
          <p className="text-center text-sm font-bold">{printData.businessName}</p>
          <p className="text-center">{printData.locationName}</p>
          <p className="mt-2">
            {printData.invoiceNo} · {new Date(printData.createdAt).toLocaleString()}
          </p>
          <p>
            Cashier: {printData.cashierName} · Customer: {printData.customerName}
          </p>
          <hr className="my-2 border-black/30" />
          {printData.items.map((i, idx) => (
            <div key={idx} className="flex justify-between gap-2 py-0.5">
              <span className="min-w-0 truncate">
                {i.qty} × {i.name}
              </span>
              <span>{naira(i.subtotal)}</span>
            </div>
          ))}
          <hr className="my-2 border-black/30" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{naira(printData.totals.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid ({printData.paymentMethod})</span>
            <span>{naira(printData.totals.paid)}</span>
          </div>
          {Number(printData.totals.due) > 0 && (
            <div className="flex justify-between">
              <span>DUE</span>
              <span>{naira(printData.totals.due)}</span>
            </div>
          )}
          <p className="mt-4 text-center">Thank you for your purchase!</p>
        </div>
      )}
    </div>
  );
}
