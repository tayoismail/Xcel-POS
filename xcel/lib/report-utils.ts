"use client";

import { toast } from "sonner";

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** Build a CSV blob and trigger a download. Returns the row count exported. */
export function downloadCsv(
  baseName: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): number {
  if (rows.length === 0) {
    toast.info("Nothing to export");
    return 0;
  }
  const csv = toCsv(header, rows);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `xcel-${baseName}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} to CSV`);
  return rows.length;
}

/** Open a styled print window with an optional summary header and a table. */
export function printReport(opts: {
  title: string;
  subtitle?: string;
  kpis?: { label: string; value: string }[];
  columns: string[];
  rows: (string | number | null | undefined)[][];
  numericFrom?: number;
}) {
  const { title, subtitle, kpis = [], columns, rows, numericFrom = 0 } = opts;
  const w = window.open("", "_blank", "width=960,height=720");
  if (!w) {
    toast.error("Couldn't open the print window — allow pop-ups for this site");
    return;
  }

  const moneyCols = new Set<number>();
  columns.forEach((c, i) => {
    if (i >= numericFrom) moneyCols.add(i);
  });

  const kpiHtml = kpis
    .map(
      (k) => `
      <div class="kpi">
        <span class="kpi-label">${escHtml(k.label)}</span>
        <span class="kpi-value">${escHtml(k.value)}</span>
      </div>`,
    )
    .join("");

  const headHtml = columns.map((c) => `<th>${escHtml(c)}</th>`).join("");
  const bodyHtml = rows.length
    ? rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (cell, i) =>
                  `<td class="${i >= numericFrom ? "num" : ""}">${escHtml(cell)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" class="empty">No data for the selected filters.</td></tr>`;

  w.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escHtml(title)} · Xcel</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 32px; }
  .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .brand h1 { font-size: 15px; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin: 0; font-weight: 700; }
  .brand .mark { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 10px; background: #059669; color: #fff; font-weight: 800; font-size: 16px; margin-right: 10px; }
  h2 { font-size: 26px; letter-spacing: -0.03em; margin: 0 0 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin: 0 0 18px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 14px; min-width: 130px; }
  .kpi-label { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 700; }
  .kpi-value { display: block; font-size: 19px; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; background: #f1f5f9; padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border-bottom: 1px solid #eef2f7; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #f8fafc; }
  .empty { text-align: center; color: #64748b; padding: 24px 0; }
  footer { margin-top: 22px; color: #94a3b8; font-size: 11px; display: flex; justify-content: space-between; }
  @media print { body { margin: 12mm; } footer { position: fixed; bottom: 0; } }
</style>
</head>
<body>
  <div class="brand">
    <div style="display:flex; align-items:center;">
      <span class="mark">X</span>
      <h1>Xcel · POS</h1>
    </div>
    <span style="color:#94a3b8; font-size:12px;">Generated ${new Date().toLocaleString("en-NG")}</span>
  </div>
  <h2>${escHtml(title)}</h2>
  <p class="subtitle">${escHtml(subtitle ?? "")}</p>
  ${kpis.length ? `<div class="KPI">${kpiHtml}</div>` : ""}
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
  <footer>
    <span>Xcel POS & Inventory</span>
    <span>${rows.length} row${rows.length === 1 ? "" : "s"}</span>
  </footer>
</body>
</html>`);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
  }, 250);
}

function escHtml(v: string | number | null | undefined): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
