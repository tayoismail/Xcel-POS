"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteExpenseAction,
  listExpensesAction,
  type ExpenseListResult,
  type ExpenseRow,
} from "@/app/actions/expenses";
import { ExpenseFormDialog } from "@/components/dashboard/expense-form-dialog";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { EmptyState, NoResultsState } from "@/components/shared/empty-state";
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
import { formatCurrency as naira } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const categoryTone: Record<string, "default" | "secondary" | "outline" | "warning" | "info"> = {
  Rent: "info",
  Utilities: "warning",
  Internet: "secondary",
  Salaries: "default",
  Transport: "outline",
  Repairs: "warning",
  Marketing: "info",
  Supplies: "secondary",
  Other: "outline",
};

export function ExpensesTable() {
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [sum, setSum] = useState("0");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null);
  const [busy, setBusy] = useState(false);

  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Only the newest in-flight response may write state.
  const refreshSeq = useRef(0);

  const refresh = useCallback(
    async (opts?: { page?: number }) => {
      const seq = ++refreshSeq.current;
      setLoading(true);
      try {
        const res: ExpenseListResult = await listExpensesAction({
          search,
          category,
          page: opts?.page ?? page,
          pageSize,
        });
        if (seq !== refreshSeq.current) return; // superseded by a newer request
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
        setPageCount(res.pageCount);
        setSum(res.sum);
      } catch {
        if (seq === refreshSeq.current) {
          setRows([]); // render the empty/error state instead of a blank table
          toast.error("Couldn't load expenses", { description: "Please try again." });
        }
      } finally {
        if (seq === refreshSeq.current) setLoading(false);
      }
    },
    [search, category, page, pageSize],
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
  }, [search, category, pageSize]);

  async function confirmDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      const res = await deleteExpenseAction(deleteTarget.id);
      if (!res.ok) {
        toast.error("Delete failed", { description: res.error });
      } else {
        toast.success("Expense deleted", {
          description: "Account balance (if any) was refunded.",
        });
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
    setCategory("ALL");
  }
  const hasFilters = search !== "" || category !== "ALL";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search description, category or account…"
          aria-label="Search expenses"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary animate-in fade-in duration-200">
            <Banknote className="size-3.5" />
            {total} expense{total === 1 ? "" : "s"} · {naira(sum)}
          </span>
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="hidden lg:table-cell">Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden md:table-cell">Recorded by</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !rows
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="pl-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Skeleton className="ml-auto h-8 w-8 rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))
              : (rows ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {formatDate(row.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={categoryTone[row.category] ?? "outline"}>
                        {row.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-64 truncate md:table-cell">
                      {row.description ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {row.accountName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-danger">
                      −{naira(row.amount)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {row.createdByName}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(row)}
                        aria-label="Delete expense"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>

        {!loading && rows && rows.length === 0 && (
          hasFilters ? (
            <NoResultsState
              description="No expenses match your current search or filters."
              onClear={clearFilters}
            />
          ) : (
            <EmptyState
              icon={Banknote}
              title="No expenses recorded"
              description="Track rent, utilities and other spend — they flow straight into net sales on the dashboard."
              actionLabel="+ Add expense"
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

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => void refresh()}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${deleteTarget.category} · ${naira(deleteTarget.amount)}` : ""}
              {" — "}the account balance will be refunded if one was used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
