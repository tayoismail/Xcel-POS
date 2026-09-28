"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileOutput,
  MoreVertical,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  convertQuotationToInvoiceAction,
  convertQuotationToSaleAction,
  deleteQuotationAction,
  getQuotationDetailAction,
  listQuotationsAction,
  type QuotationCounts,
  type QuotationDetail,
  type QuotationRow,
} from "@/app/actions/quotations";
import { QuotationFormDialog } from "@/components/dashboard/quotation-form-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const quotationStatusBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SENT: { label: "Sent", variant: "info" },
  ACCEPTED: { label: "Accepted", variant: "default" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  EXPIRED: { label: "Expired", variant: "outline" },
};

type StatusChip = "ALL" | "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";

type ConvertTarget = {
  quotation: QuotationRow;
  mode: "invoice" | "sale";
  detail: QuotationDetail | null;
  loading: boolean;
};

export function QuotationsTable() {
  const router = useRouter();
  const [rows, setRows] = useState<QuotationRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState<QuotationCounts>({
    all: 0,
    draft: 0,
    sent: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusChip>("ALL");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [convert, setConvert] = useState<ConvertTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuotationRow | null>(null);
  const [busy, setBusy] = useState(false);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      setLoading(true);
      try {
        const res = await listQuotationsAction({
          search,
          status,
          page: opts?.page ?? page,
          pageSize,
        });
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
        setPageCount(res.pageCount);
        setCounts(res.counts);
      } catch {
        toast.error("Couldn't load quotations", { description: "Please try again." });
      } finally {
        setLoading(false);
      }
    },
    [search, status, page, pageSize],
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
  }, [search, status, pageSize]);

  function openConvert(row: QuotationRow, mode: "invoice" | "sale") {
    setConvert({ quotation: row, mode, detail: null, loading: true });
    void getQuotationDetailAction(row.id)
      .then((res) => {
        setConvert((prev) =>
          prev && prev.quotation.id === row.id
            ? { ...prev, detail: res.ok ? res.quotation : null, loading: false }
            : prev,
        );
      })
      .catch(() =>
        setConvert((prev) => (prev ? { ...prev, loading: false } : prev)),
      );
  }

  async function confirmConvert() {
    if (!convert) return;
    setBusy(true);
    try {
      const res =
        convert.mode === "invoice"
          ? await convertQuotationToInvoiceAction(convert.quotation.id)
          : await convertQuotationToSaleAction(convert.quotation.id);
      if (!res.ok) {
        toast.error("Conversion failed", { description: res.error });
        return;
      }
      if (convert.mode === "invoice") {
        toast.success(`Converted to invoice ${res.number}`, {
          action: { label: "View invoices", onClick: () => router.push("/dashboard/invoices") },
        });
      } else {
        toast.success(`Sale ${res.invoiceNo} created`, {
          description: "Stock deducted and cash payment recorded.",
          action: { label: "Open POS", onClick: () => router.push("/dashboard/pos") },
        });
      }
      setConvert(null);
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await deleteQuotationAction(deleteTarget.id);
    if (!res.ok) {
      toast.error("Delete failed", { description: res.error });
    } else {
      toast.success(`${deleteTarget.number} deleted`);
      void refresh();
    }
    setDeleteTarget(null);
  }

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
  }
  const hasFilters = search !== "" || status !== "ALL";

  const chips: { key: StatusChip; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "DRAFT", label: "Draft", count: counts.draft },
    { key: "SENT", label: "Sent", count: counts.sent },
    { key: "ACCEPTED", label: "Accepted", count: counts.accepted },
    { key: "REJECTED", label: "Rejected", count: counts.rejected },
    { key: "EXPIRED", label: "Expired", count: counts.expired },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search number, customer or item…"
          aria-label="Search quotations"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <ReceiptText className="size-3.5" />
            {total} quotation{total === 1 ? "" : "s"}
          </span>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChips options={chips} value={status} onChange={setStatus} />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Number</TableHead>
              <TableHead className="hidden md:table-cell">Issued</TableHead>
              <TableHead className="hidden lg:table-cell">Valid until</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden xl:table-cell text-center">Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
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
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Skeleton className="mx-auto h-4 w-8" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => {
                  const st = quotationStatusBadge[row.status];
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="pl-4">
                        <span className="font-mono text-sm font-semibold tracking-tight">
                          {row.number}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {formatDate(row.issueDate)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {row.validUntil ? formatDate(row.validUntil) : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate sm:table-cell">
                        {row.customerName ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums xl:table-cell">
                        {row.itemCount}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st?.variant ?? "outline"}>
                          {st?.label ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {naira(row.totalAmount)}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${row.number}`}
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {row.convertible && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => openConvert(row, "invoice")}
                                >
                                  <FileOutput className="size-4" />
                                  Convert to invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openConvert(row, "sale")}>
                                  <ArrowRight className="size-4" />
                                  Convert to POS sale
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={row.status === "ACCEPTED"}
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
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
              description="No quotations match your current search or filters."
              onClear={clearFilters}
            />
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No quotations yet"
              description="Draft a quote for a customer, then convert it to an invoice or a POS sale."
              actionLabel="+ Create quotation"
              onAction={() => setFormOpen(true)}
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

      <QuotationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => void refresh()}
      />

      {/* Convert confirm */}
      <AlertDialog
        open={!!convert}
        onOpenChange={(o) => !o && setConvert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Convert {convert?.quotation.number} to{" "}
              {convert?.mode === "invoice" ? "an invoice" : "a POS sale"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {convert?.mode === "invoice"
                ? "Creates a new issued invoice with the same lines and customer. The quotation is marked accepted."
                : "Creates a completed cash sale at your first location, deducts stock and records SALE movements. The quotation is marked accepted."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl border border-border/70 bg-secondary/50 p-3 text-sm">
            {convert?.loading ? (
              <Skeleton className="h-14 w-full" />
            ) : convert?.detail ? (
              <div className="grid gap-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-semibold">
                    {convert.detail.customerName ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lines</span>
                  <span className="font-semibold">{convert.detail.items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold tabular-nums">
                    {naira(convert.detail.totalAmount)}
                  </span>
                </div>
                {convert.mode === "sale" &&
                convert.detail.items.some((i) => !i.productId) ? (
                  <p className="mt-1 text-danger">
                    This quote has custom lines — convert to an invoice instead.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                busy ||
                !!convert?.loading ||
                (convert?.mode === "sale" &&
                  !!convert?.detail?.items.some((i) => !i.productId))
              }
              onClick={() => void confirmConvert()}
            >
              {busy
                ? "Converting…"
                : convert?.mode === "invoice"
                  ? "Create invoice"
                  : "Create sale"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The quotation and its line items will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger hover:bg-danger/90"
              onClick={() => void confirmDelete()}
            >
              Delete quotation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
