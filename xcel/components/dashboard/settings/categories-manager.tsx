"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createCategoryAction,
  deleteCategoryAction,
  listCategoriesAction,
} from "@/app/actions/products";
import { EmptyState } from "@/components/shared/empty-state";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type CategoryRow = { id: string; name: string; productCount: number };

export function CategoriesManager() {
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRows(await listCategoriesAction());
    } catch {
      toast.error("Couldn't load categories", { description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a category name");
      return;
    }
    setSaving(true);
    try {
      const res = await createCategoryAction({ name: trimmed });
      if (!res.ok) {
        toast.error("Couldn't add category", { description: res.error });
        return;
      }
      toast.success(`Category “${trimmed}” added`);
      setName("");
      void refresh();
    } catch {
      toast.error("Couldn't add category", { description: "Check your connection and try again." });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteCategoryAction(deleteTarget.id);
      if (!res.ok) {
        toast.error("Couldn't delete category", { description: res.error });
        return;
      }
      toast.success(`Category “${deleteTarget.name}” deleted`, {
        description:
          deleteTarget.productCount > 0
            ? `${deleteTarget.productCount} product${deleteTarget.productCount === 1 ? "" : "s"} kept, now uncategorized.`
            : undefined,
      });
      setDeleteTarget(null);
      void refresh();
    } catch {
      toast.error("Couldn't delete category", { description: "Check your connection and try again." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addCategory} className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name…"
          maxLength={60}
          className="h-9 w-full sm:w-72"
          aria-label="New category name"
        />
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add category
        </Button>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-soft-green px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-primary">
          {rows?.length ?? 0} categor{(rows?.length ?? 0) === 1 ? "y" : "ies"}
        </span>
      </form>

      <div className="card-premium overflow-hidden">
        {loading && !rows ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-xl" />
            ))}
          </div>
        ) : rows && rows.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title="No categories yet"
            description="Group your products (e.g. Phones, Accessories) — they'll show up in the product form, POS and reports."
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {(rows ?? []).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {c.productCount} product{c.productCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(c)}
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.productCount > 0
                ? `${deleteTarget.productCount} product${deleteTarget.productCount === 1 ? "" : "s"} use this category — they'll stay in your catalog but become uncategorized. This can't be undone.`
                : "This category will be removed. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
