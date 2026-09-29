"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  importProductsAction,
  type ImportProductRow,
} from "@/app/actions/products";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TEMPLATE_HEADERS = [
  "Name",
  "SKU",
  "Barcode",
  "Category",
  "Brand",
  "Price",
  "Cost Price",
  "Stock",
  "Alert at",
  "Status",
];

const TEMPLATE_SAMPLE = [
  "iPhone 13 128GB,IPH13-128,,Phones,Apple,450000,400000,10,5,ACTIVE",
  "Anker 20W Charger,ANK-20W,,Accessories,Anker,8500,6000,25,5,ACTIVE",
];

const MAX_ROWS = 500;
const PREVIEW_ROWS = 20;

type ParsedRow = {
  rowNo: number;
  data: ImportProductRow;
  issue: string | null;
};

/** Minimal quote-aware CSV parser (handles commas/newlines inside quotes). */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}

const normHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function buildRows(grid: string[][]): { rows: ParsedRow[]; error: string | null; truncated: number } {
  if (grid.length < 2) {
    return { rows: [], error: "The file needs a header row plus at least one product.", truncated: 0 };
  }

  const header = grid[0].map(normHeader);
  const col = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const idx = {
    name: col(["name", "productname", "product"]),
    sku: col(["sku", "productsku"]),
    barcode: col(["barcode", "upc", "ean"]),
    category: col(["category", "group"]),
    brand: col(["brand"]),
    price: col(["price", "sellingprice", "saleprice"]),
    costPrice: col(["costprice", "cost", "unitcost"]),
    stock: col(["stock", "quantity", "qty", "openingstock"]),
    alertAt: col(["alertat", "alert", "reorderat"]),
    status: col(["status"]),
  };

  if (idx.name === -1 || idx.price === -1) {
    return {
      rows: [],
      error: "Header must include at least “Name” and “Price” columns.",
      truncated: 0,
    };
  }

  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const rows: ParsedRow[] = [];
  let truncated = 0;
  for (let i = 1; i < grid.length; i++) {
    const r = grid[i];
    if (r.every((v) => !v.trim())) continue;
    if (rows.length >= MAX_ROWS) {
      truncated++; // past the cap — count it so the UI can say so
      continue;
    }

    const rowNo = rows.length + 1;
    const price = get(r, idx.price);
    const name = get(r, idx.name);

    let issue: string | null = null;
    if (!name) issue = "Missing name";
    else if (!price || !Number.isFinite(Number(price)) || Number(price) < 0) {
      issue = `Invalid price “${price}”`;
    }

    rows.push({
      rowNo,
      issue,
      data: {
        name,
        sku: get(r, idx.sku),
        barcode: get(r, idx.barcode),
        category: get(r, idx.category),
        brand: get(r, idx.brand),
        price,
        costPrice: get(r, idx.costPrice),
        stock: get(r, idx.stock),
        alertAt: get(r, idx.alertAt),
        status: get(r, idx.status),
      },
    });
  }

  if (rows.length === 0) {
    return { rows: [], error: "No product rows found in the file.", truncated: 0 };
  }
  return { rows, error: null, truncated };
}

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_SAMPLE].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "xcel-product-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ProductImport() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [truncated, setTruncated] = useState(0);

  function reset() {
    setFileName(null);
    setRows(null);
    setParseError(null);
    setTruncated(0);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File) {
    setReading(true);
    setParseError(null);
    try {
      const text = await file.text();
      const { rows: parsed, error, truncated: dropped } = buildRows(parseCsv(text));
      setFileName(file.name);
      if (error) {
        setRows(null);
        setTruncated(0);
        setParseError(error);
      } else {
        setRows(parsed);
        setTruncated(dropped);
      }
    } catch {
      setRows(null);
      setTruncated(0);
      setParseError("Couldn't read that file — please upload a UTF-8 CSV.");
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    if (!rows || rows.length === 0) return;
    const valid = rows.filter((r) => !r.issue);
    if (valid.length === 0) {
      toast.error("No valid rows to import");
      return;
    }
    setImporting(true);
    try {
      const res = await importProductsAction(valid.map((r) => r.data));
      if (!res.ok) {
        const partial = res.result;
        if (partial && partial.created > 0) {
          // Some rows landed before the failure — report both facts instead
          // of swallowing the counts.
          const extra =
            partial.errors.length > 0
              ? ` ${partial.errors.length} row${partial.errors.length === 1 ? "" : "s"} had issues.`
              : partial.skipped > 0
                ? ` ${partial.skipped} skipped as duplicates.`
                : "";
          toast.error(
            `Import interrupted — ${partial.created} product${partial.created === 1 ? "" : "s"} created`,
            { description: `${res.error}${extra}` },
          );
        } else {
          toast.error("Import failed", { description: res.error });
        }
        return;
      }
      if (!res.result) {
        toast.error("Import failed", { description: "Try again." });
        return;
      }
      const { created, skipped, errors } = res.result;
      toast.success(
        `Imported ${created} product${created === 1 ? "" : "s"}`,
        {
          description:
            skipped > 0
              ? `${skipped} skipped as duplicates.`
              : errors.length > 0
                ? `${errors.length} row${errors.length === 1 ? "" : "s"} had issues.`
                : undefined,
        },
      );
      reset();
    } catch {
      toast.error("Import failed", { description: "Network error — please try again." });
    } finally {
      setImporting(false);
    }
  }

  const validCount = rows?.filter((r) => !r.issue).length ?? 0;
  const issueCount = rows?.filter((r) => r.issue).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Upload target */}
      <div className="card-premium flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-soft-green">
          <FileSpreadsheet className="size-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Mass upload products from a CSV file</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Columns: Name, SKU, Barcode, Category, Brand, Price, Cost Price, Stock, Alert at,
            Status. Missing categories are created automatically; blank SKUs are generated;
            duplicate SKUs are skipped.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Template
          </Button>
          <Button size="sm" onClick={() => fileInput.current?.click()} disabled={reading}>
            {reading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Choose CSV
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="CSV file with products"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
      </div>

      {reading && rows === null && !parseError ? (
        <div className="card-premium grid gap-2 p-4">
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-10 rounded-xl" />
        </div>
      ) : null}

      {parseError ? (
        <div className="card-premium border-destructive/40 p-5">
          <p className="text-sm font-medium text-destructive">Can&apos;t import this file</p>
          <p className="mt-1 text-xs text-muted-foreground">{parseError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reset}>
            Choose another file
          </Button>
        </div>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="card-premium overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            <span className="truncate text-sm font-medium">{fileName}</span>
            <Badge variant="secondary" className="tabular-nums">
              {validCount} ready
            </Badge>
            {issueCount > 0 ? (
              <Badge variant="destructive" className="tabular-nums">
                {issueCount} issue{issueCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {truncated > 0 ? (
              <Badge variant="destructive" className="tabular-nums">
                {truncated} row{truncated === 1 ? "" : "s"} over the {MAX_ROWS}-row limit dropped
              </Badge>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={reset} disabled={importing}>
                Cancel
              </Button>
              <Button size="sm" onClick={runImport} disabled={importing || validCount === 0}>
                {importing ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Import {validCount} product{validCount === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12 text-right">#</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="hidden lg:table-cell">Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Stock</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, PREVIEW_ROWS).map((r) => (
                <TableRow key={r.rowNo} className={r.issue ? "bg-destructive/5" : undefined}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.rowNo}
                  </TableCell>
                  <TableCell>
                    <span className={r.issue ? "text-destructive" : undefined}>
                      {r.data.name || "—"}
                    </span>
                    {r.issue ? (
                      <span className="ml-2 text-xs font-medium text-destructive">{r.issue}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                    {r.data.sku || "auto"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {r.data.category || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.data.price || "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {r.data.stock || "0"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.data.status?.toUpperCase() === "INACTIVE" ? "outline" : "default"
                      }
                    >
                      {r.data.status?.toUpperCase() === "INACTIVE" ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {rows.length > PREVIEW_ROWS ? (
            <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
              Showing first {PREVIEW_ROWS} of {rows.length} rows — all rows will be imported.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
