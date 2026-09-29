"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  Download,
  PackageOpen,
  Pencil,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteProductsAction,
  listCategoriesAction,
  listProductsAction,
  setProductStatusAction,
  type ProductRow,
} from "@/app/actions/products";
import { ProductFormDialog } from "@/components/dashboard/product-form-dialog";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
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
import { Checkbox } from "@/components/ui/checkbox";
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

type Category = { id: string; name: string };

const PAGE_SIZES = ["25", "50", "100"];

export function ProductsTable({
  initialRows,
  userRole = "STAFF",
}: {
  initialRows: ProductRow[];
  userRole?: "OWNER" | "MANAGER" | "STAFF";
}) {
  const isManager = userRole === "OWNER" || userRole === "MANAGER";
  const [rows, setRows] = useState<ProductRow[]>(initialRows);
  const [total, setTotal] = useState(initialRows.length);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const firstRender = useRef(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic sequence — only the newest in-flight response may write state.
  const refreshSeq = useRef(0);

  async function refresh(opts?: { search?: string; page?: number; pageSize?: number }) {
    const seq = ++refreshSeq.current;
    setLoading(true);
    try {
      const res = await listProductsAction({
        search: opts?.search ?? search,
        page: opts?.page ?? page,
        pageSize: opts?.pageSize ?? pageSize,
      });
      if (seq !== refreshSeq.current) return; // a newer request superseded this one
      setRows(res.rows);
      setTotal(res.total);
      setPageCount(res.pageCount);
      setPage(res.page);
      setSelected(new Set()); // rows changed — drop stale cross-page selection
    } catch {
      if (seq === refreshSeq.current) {
        toast.error("Couldn't load products", { description: "Please try again." });
      }
    } finally {
      if (seq === refreshSeq.current) setLoading(false);
    }
  }

  // Debounced reload when search / page size / page changes
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(() => {
        void refresh({ page: 1 });
      });
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pageSize]);

  function changePage(next: number) {
    setPage(next);
    void refresh({ page: next });
  }

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someOnPageSelected = rows.some((r) => selected.has(r.id));
  const selectedCount = selected.size;

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        rows.forEach((r) => next.delete(r.id));
      } else {
        rows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Optimistic status flip — rolls back on failure. */
  function bulkStatus(status: "ACTIVE" | "INACTIVE") {
    const ids = [...selected];
    const snapshot = rows;
    setRows((prev) =>
      prev.map((r) => (selected.has(r.id) ? { ...r, status } : r)),
    );
    startTransition(() => {
      void setProductStatusAction(ids, status)
        .then((res) => {
          if (res.ok) {
            toast.success(
              `${ids.length} product${ids.length > 1 ? "s" : ""} ${status === "ACTIVE" ? "activated" : "deactivated"}`,
            );
          } else {
            setRows(snapshot);
            toast.error("Bulk update failed", { description: res.error });
          }
        })
        .catch(() => {
          setRows(snapshot); // action threw / network dropped — roll back
          toast.error("Bulk update failed", { description: "Network error — please try again." });
        });
    });
  }

  function bulkDelete() {
    const ids = [...selected];
    const snapshot = rows;
    const removed = rows.filter((r) => selected.has(r.id));
    // Optimistic removal
    setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setTotal((t) => Math.max(0, t - ids.length));
    setConfirmDelete(false);
    startTransition(() => {
      void deleteProductsAction(ids)
        .then((res) => {
          if (res.ok) {
            toast.success(`Deleted ${ids.length} product${ids.length > 1 ? "s" : ""}`, {
              description: removed.map((r) => r.name).slice(0, 3).join(", ") + (ids.length > 3 ? "…" : ""),
            });
            void refresh();
          } else {
            setRows(snapshot);
            setSelected(new Set(ids));
            toast.error("Delete failed", { description: res.error });
          }
        })
        .catch(() => {
          setRows(snapshot); // action threw / network dropped — roll back
          setSelected(new Set(ids));
          toast.error("Delete failed", { description: "Network error — please try again." });
        });
    });
  }

  function exportCsv() {
    const ids = selectedCount > 0 ? [...selected] : null;
    const scope = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    if (scope.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    const header = "Name,SKU,Barcode,Category,Brand,Price,Stock,Alert at,Status";
    const body = scope
      .map((r) =>
        [
          r.name,
          r.sku,
          r.barcode ?? "",
          r.category ?? "",
          r.brand ?? "",
          r.price,
          String(r.stock),
          String(r.alertAt),
          r.status,
        ]
          .map((v) => (v.includes(",") || v.includes('"') ? `"${v.replaceAll('"', '""')}"` : v))
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xcel-products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${scope.length} product${scope.length > 1 ? "s" : ""} to CSV`);
  }

  const [categories, setCategories] = useState<Category[]>([]);
  // Refresh on every open so categories added in Settings show up immediately.
  async function openForm(product: ProductRow | null) {
    void listCategoriesAction()
      .then(setCategories)
      .catch(() => toast.error("Couldn't load categories"));
    setEditing(product);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, SKU or barcode…"
          aria-label="Search products"
        />

        <Select
          value={String(pageSize)}
          onValueChange={(v) => setPageSize(Number(v))}
        >
          <SelectTrigger className="w-[110px]" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={s}>
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isManager && (
            <Button onClick={() => void openForm(null)}>
              <Plus className="size-4" />
              Add product
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && isManager && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/25 bg-soft-green px-3.5 py-2.5">
          <span className="text-sm font-semibold tabular-nums">
            {selectedCount} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => bulkStatus("ACTIVE")}
          >
            Activate
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => bulkStatus("INACTIVE")}
          >
            Deactivate
          </Button>
          <Button variant="outline" size="sm" disabled={isPending} onClick={exportCsv}>
            <Download className="size-4" />
            Export
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-10 pl-4">
                <Checkbox
                  checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all on page"
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="hidden md:table-cell">ID</TableHead>
              <TableHead className="hidden lg:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Brand</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Price (₦)</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="hidden xl:table-cell text-right">Alert at</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
              : rows.map((product) => {
                  const isSelected = selected.has(product.id);
                  const lowStock = product.stock <= product.alertAt;
                  return (
                    <TableRow
                      key={product.id}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(loading && "opacity-60")}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(product.id)}
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative size-9 shrink-0 overflow-hidden rounded-lg border border-border/50 bg-muted">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt=""
                                fill
                                sizes="36px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="grid size-full place-items-center text-[10px] font-medium text-muted-foreground">
                                {product.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <span className="max-w-52 truncate font-medium">
                            {product.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {product.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {product.category ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {product.brand ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {naira(product.price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={cn(lowStock && "font-semibold text-warning")}>
                          {product.stock}
                        </span>
                        {lowStock ? (
                          <span className="ml-1.5 text-xs font-semibold text-warning">Low</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-right text-muted-foreground tabular-nums xl:table-cell">
                        {product.alertAt}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={product.status === "ACTIVE" ? "default" : "outline"}
                          className={cn(product.status !== "ACTIVE" && "text-muted-foreground")}
                        >
                          {product.status === "ACTIVE" ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4">
                        {isManager && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void openForm(product)}
                            aria-label={`Edit ${product.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>

        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={PackageOpen}
            title={search ? "No products match your search" : "No products yet"}
            description={
              search
                ? `Nothing found for “${search}”. Try a different name, SKU or barcode.`
                : "Add your first product to start tracking stock and sales."
            }
            actionLabel={!search ? "Add product" : undefined}
            onAction={!search ? () => void openForm(null) : undefined}
          />
        )}

        {/* Footer / pagination */}
        {rows.length > 0 && (
          <TablePagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPrevious={() => changePage(page - 1)}
            onNext={() => changePage(page + 1)}
          />
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} product{selectedCount > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be removed from your catalog but kept in sales history
              (soft delete). This can&apos;t be undone from the dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={isPending} onClick={bulkDelete}>
                {isPending ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create / edit dialog */}
      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        categories={categories}
        product={editing}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function RowSkeleton() {
  return (
    <TableRow>
      <TableCell className="pl-4">
        <Skeleton className="size-4 rounded" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-36" />
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-20" />
      </TableCell>
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-8" />
      </TableCell>
      <TableCell className="hidden xl:table-cell">
        <Skeleton className="ml-auto h-4 w-8" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-14 rounded-full" />
      </TableCell>
      <TableCell className="pr-4">
        <Skeleton className="size-7" />
      </TableCell>
    </TableRow>
  );
}
