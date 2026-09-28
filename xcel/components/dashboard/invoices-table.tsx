"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilePlus2,
  FileText,
  MoreVertical,
  Pencil,
  Printer,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import {
  getInvoiceDetailAction,
  listInvoicesAction,
  updateInvoiceAction,
  type InvoiceCounts,
  type InvoiceDetail,
  type InvoiceRow,
} from "@/app/actions/invoices";
import { InvoiceFormDialog } from "@/components/dashboard/invoice-form-dialog";
import { InvoiceFromSaleDialog } from "@/components/dashboard/invoice-from-sale-dialog";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn, formatCurrency as naira } from "@/lib/utils";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const invoiceStatusBadge: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" | "warning" | "info" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  ISSUED: { label: "Issued", variant: "info" },
  PAID: { label: "Paid", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

type StatusChip = "ALL" | "DRAFT" | "ISSUED" | "PAID" | "CANCELLED";

export function InvoicesTable() {
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [counts, setCounts] = useState<InvoiceCounts>({
    all: 0,
    draft: 0,
    issued: 0,
    paid: 0,
    cancelled: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusChip>("ALL");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [fromSaleOpen, setFromSaleOpen] = useState(false);
  const [updateTarget, setUpdateTarget] = useState<InvoiceRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [printData, setPrintData] = useState<InvoiceDetail | null>(null);

  // Update dialog fields
  const [updStatus, setUpdStatus] = useState<string>("ISSUED");
  const [updPaid, setUpdPaid] = useState("0");
  const [saving, setSaving] = useState(false);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      setLoading(true);
      try {
        const res = await listInvoicesAction({
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
        toast.error("Couldn't load invoices", { description: "Please try again." });
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

  async function openPrint(invoiceId: string) {
    const res = await getInvoiceDetailAction(invoiceId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setPrintData(res.invoice);
  }

  function openUpdate(row: InvoiceRow) {
    setUpdateTarget(row);
    setUpdStatus(row.status);
    setUpdPaid(row.amountPaid);
  }

  async function saveUpdate() {
    if (!updateTarget) return;
    setSaving(true);
    try {
      const res = await updateInvoiceAction({
        invoiceId: updateTarget.id,
        status: updStatus as InvoiceRow["status"],
        amountPaid: Number(updPaid) || 0,
      });
      if (!res.ok) {
        toast.error("Couldn't update invoice", { description: res.error });
        return;
      }
      toast.success(`Invoice ${updateTarget.number} updated`);
      setUpdateTarget(null);
      void refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget || busy) return;
    setBusy(true);
    try {
      const res = await updateInvoiceAction({
        invoiceId: cancelTarget.id,
        status: "CANCELLED",
      });
      if (!res.ok) {
        toast.error("Couldn't cancel invoice", { description: res.error });
      } else {
        toast.success(`${cancelTarget.number} cancelled`);
        void refresh();
      }
      setCancelTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatus("ALL");
  }
  const hasFilters = search !== "" || status !== "ALL";

  const chips: { key: StatusChip; label: string; count: number }[] = [
    { key: "ALL", label: "All", count: counts.all },
    { key: "DRAFT", label: "Draft", count: counts.draft },
    { key: "ISSUED", label: "Issued", count: counts.issued },
    { key: "PAID", label: "Paid", count: counts.paid },
    { key: "CANCELLED", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search number, customer or sale…"
          aria-label="Search invoices"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <FileText className="size-3.5" />
            {total} invoice{total === 1 ? "" : "s"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setFromSaleOpen(true)}>
            <Receipt className="size-4" />
            From credit sale
          </Button>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <FilePlus2 className="size-4" />
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
              <TableHead className="hidden lg:table-cell">Due</TableHead>
              <TableHead className="hidden sm:table-cell">Customer</TableHead>
              <TableHead className="hidden xl:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden md:table-cell text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
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
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => {
                  const st = invoiceStatusBadge[row.status];
                  const balance = Number(row.balance);
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
                        {row.dueDate ? formatDate(row.dueDate) : "—"}
                      </TableCell>
                      <TableCell className="hidden max-w-40 truncate sm:table-cell">
                        {row.customerName ?? (
                          <span className="text-muted-foreground">Walk-in</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {row.saleInvoiceNo ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {row.saleInvoiceNo}
                          </span>
                        ) : (
                          <Badge variant="outline">Manual</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st?.variant ?? "outline"}>
                          {st?.label ?? row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {naira(row.totalAmount)}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                        {naira(row.amountPaid)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-semibold tabular-nums",
                          balance > 0 && row.status !== "CANCELLED"
                            ? "text-danger"
                            : "text-muted-foreground",
                        )}
                      >
                        {naira(row.balance)}
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
                            <DropdownMenuItem onClick={() => void openPrint(row.id)}>
                              <Printer className="size-4" />
                              Print / PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openUpdate(row)}>
                              <Pencil className="size-4" />
                              Update payment
                            </DropdownMenuItem>
                            {row.status !== "CANCELLED" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setCancelTarget(row)}
                                >
                                  Cancel invoice
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
              description="No invoices match your current search or filters."
              onClear={clearFilters}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Create a formal invoice manually, or generate one from a credit sale."
              actionLabel="+ Create invoice"
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

      <InvoiceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => void refresh()}
      />
      <InvoiceFromSaleDialog
        open={fromSaleOpen}
        onOpenChange={setFromSaleOpen}
        onSaved={() => void refresh()}
      />

      {/* Update dialog */}
      <Dialog
        open={!!updateTarget}
        onOpenChange={(o) => !o && setUpdateTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update {updateTarget?.number}</DialogTitle>
            <DialogDescription>
              Record a payment or change the invoice status.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={updStatus} onValueChange={setUpdStatus}>
                <SelectTrigger className="w-full" aria-label="Invoice status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="upd-paid">Amount paid</Label>
              <Input
                id="upd-paid"
                type="number"
                min={0}
                step="0.01"
                value={updStatus === "PAID" ? updateTarget?.totalAmount ?? "0" : updPaid}
                disabled={updStatus === "PAID"}
                onChange={(e) => setUpdPaid(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Total {updateTarget ? naira(updateTarget.totalAmount) : ""} · balance{" "}
                <span className="font-semibold text-danger">
                  {updateTarget
                    ? naira(
                        Math.max(
                          0,
                          Number(updateTarget.totalAmount) -
                            (updStatus === "PAID"
                              ? Number(updateTarget.totalAmount)
                              : Number(updPaid) || 0),
                        ),
                      )
                    : ""}
                </span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUpdateTarget(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveUpdate()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The invoice will be marked cancelled. This does not reverse any
              payments already recorded against the linked sale.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep invoice</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              disabled={busy}
              onClick={() => void confirmCancel()}
            >
              {busy ? "Cancelling…" : "Cancel invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Printable invoice */}
      {printData && (
        <div
          className="receipt-print fixed top-0 -left-[9999px] w-[720px] bg-white p-10 font-sans text-[13px] text-black"
          aria-hidden
        >
          <div className="flex items-start justify-between border-b-2 border-black pb-4">
            <div>
              <p className="text-xl leading-tight font-bold tracking-tight">
                {printData.businessName}
              </p>
              <p className="text-xs text-neutral-600">Invoice</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{printData.number}</p>
              <p className="text-xs">
                Issued: {formatDate(printData.issueDate)}
              </p>
              {printData.dueDate ? (
                <p className="text-xs">Due: {formatDate(printData.dueDate)}</p>
              ) : null}
              <span
                className={cn(
                  "mt-1 inline-block rounded border border-black px-2 py-0.5 text-[11px] font-bold uppercase",
                  printData.status === "PAID" && "bg-black text-white",
                )}
              >
                {printData.status}
              </span>
            </div>
          </div>

          <div className="mt-4 flex justify-between gap-8">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                Bill to
              </p>
              <p className="font-semibold">{printData.customerName ?? "Walk-in Customer"}</p>
            </div>
            {printData.saleInvoiceNo ? (
              <div className="text-right">
                <p className="text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                  Sale reference
                </p>
                <p className="font-mono">{printData.saleInvoiceNo}</p>
              </div>
            ) : null}
          </div>

          <table className="mt-6 w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-2">Description</th>
                <th className="w-16 py-2 text-right">Qty</th>
                <th className="w-28 py-2 text-right">Unit price</th>
                <th className="w-32 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {printData.items.map((i, idx) => (
                <tr key={idx} className="border-b border-neutral-300">
                  <td className="py-2">{i.name}</td>
                  <td className="py-2 text-right tabular-nums">{i.qty}</td>
                  <td className="py-2 text-right tabular-nums">{naira(i.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {naira(i.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end">
            <table className="text-[13px]">
              <tbody>
                <tr>
                  <td className="py-1 pr-10 font-semibold">Total</td>
                  <td className="py-1 text-right font-bold tabular-nums">
                    {naira(printData.totalAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-10">Paid</td>
                  <td className="py-1 text-right tabular-nums">
                    {naira(printData.amountPaid)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1 pr-10 font-bold">Balance due</td>
                  <td className="py-1 text-right font-bold tabular-nums">
                    {naira(
                      Math.max(
                        0,
                        Number(printData.totalAmount) - Number(printData.amountPaid),
                      ),
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {printData.notes ? (
            <p className="mt-6 border-t border-neutral-300 pt-3 text-xs text-neutral-700">
              <span className="font-bold">Notes:</span> {printData.notes}
            </p>
          ) : null}
          <p className="mt-8 text-center text-[11px] text-neutral-500">
            Generated by {printData.businessName} · Xcel POS
          </p>
        </div>
      )}
    </div>
  );
}
