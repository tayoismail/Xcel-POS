"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LoaderCircle, Upload, X } from "lucide-react";
import { toast } from "sonner";

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
import { createProductAction, updateProductAction } from "@/app/actions/products";
import type { ProductRow } from "@/app/actions/products";

type Category = { id: string; name: string };

const emptyForm = {
  name: "",
  sku: "",
  barcode: "",
  categoryId: "",
  brand: "",
  price: "",
  costPrice: "",
  alertAt: "5",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  description: "",
};

export function ProductFormDialog({
  open,
  onOpenChange,
  categories,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  product?: ProductRow | null;
  onSaved: () => void;
}) {
  const isEdit = !!product;
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(
        product
          ? {
              name: product.name,
              sku: product.sku,
              barcode: product.barcode ?? "",
              categoryId: product.categoryId ?? "",
              brand: product.brand ?? "",
              price: product.price,
              costPrice: product.costPrice,
              alertAt: String(product.alertAt),
              status: product.status,
              description: product.description ?? "",
            }
          : emptyForm,
      );
      setFile(null);
      setPreview(product?.imageUrl ?? null);
    }
  }, [open, product]);

  function set<K extends keyof typeof emptyForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) {
      toast.error("Image too large", { description: "Max size is 5 MB." });
      return;
    }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  function clearImage() {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim() || !form.price) {
      toast.error("Missing fields", {
        description: "Name, SKU and price are required.",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        categoryId: form.categoryId || null,
        brand: form.brand.trim() || null,
        price: form.price,
        costPrice: form.costPrice.trim() || "0",
        // `Number("") || 5` would turn a legitimate 0 into 5 — treat blank/invalid as default.
        alertAt:
          form.alertAt.trim() !== "" && Number.isFinite(Number(form.alertAt))
            ? Math.max(0, Math.trunc(Number(form.alertAt)))
            : 5,
        status: form.status,
        description: form.description.trim() || null,
      };
      const res = isEdit
        ? await updateProductAction(product.id, payload, file)
        : await createProductAction(payload, file);

      if (!res.ok) {
        toast.error(isEdit ? "Update failed" : "Couldn't create product", {
          description: res.error,
        });
        return;
      }
      toast.success(isEdit ? "Product updated" : "Product created", {
        description: form.name,
      });
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? "Update failed" : "Couldn't create product", {
        description: "Network error — please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the product details below."
              : "Create a new product in your catalog."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4">
          {/* Image upload */}
          <div className="flex items-center gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted">
              {preview ? (
                <>
                  <Image
                    src={preview}
                    alt="Product image preview"
                    fill
                    sizes="80px"
                    className="object-cover"
                    unoptimized={preview.startsWith("blob:")}
                  />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    aria-label="Remove image"
                  >
                    <X className="size-3" />
                  </button>
                </>
              ) : (
                <div className="grid size-full place-items-center text-muted-foreground">
                  <Upload className="size-5" />
                </div>
              )}
            </div>
            <div className="grid gap-1.5">
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-4" />
                {preview ? "Change image" : "Upload image"}
              </Button>
              <p className="text-xs text-muted-foreground">PNG/JPG, up to 5 MB</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="p-name">Name *</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="iPhone 12 Screen Assembly"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-sku">SKU *</Label>
              <Input
                id="p-sku"
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="SCR-IP12"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-barcode">Barcode</Label>
              <Input
                id="p-barcode"
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                placeholder="501001"
              />
            </div>
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={form.categoryId || undefined}
                onValueChange={(v) => set("categoryId", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-brand">Brand</Label>
              <Input
                id="p-brand"
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="OEM"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-price">Price (₦) *</Label>
              <Input
                id="p-price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
                placeholder="42000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-cost">Cost price (₦)</Label>
              <Input
                id="p-cost"
                type="number"
                min="0"
                step="0.01"
                value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)}
                placeholder="31000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-alert">Alert at</Label>
              <Input
                id="p-alert"
                type="number"
                min="0"
                step="1"
                value={form.alertAt}
                onChange={(e) => set("alertAt", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="p-desc">Description</Label>
              <Input
                id="p-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional notes about this product"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Saving…
                </>
              ) : isEdit ? (
                "Save changes"
              ) : (
                "Create product"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
