/**
 * Minimal dependency-free PDF writer — enough for receipt-style documents:
 * text, lines, and right-aligned money columns. Outputs WinAnsi (Latin-1)
 * text; characters outside that range are transliterated.
 */

export type PdfOptions = { width?: number; height?: number };

const PAGE_W = 226.77; // 80mm receipt
const PAGE_H = 800;
const MARGIN = 14;
const FONT = "Helvetica";
const FONT_BOLD = "Helvetica-Bold";

/** Approximate Helvetica advance widths (per 1000 units) for the chars we use. */
const WIDTHS: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556,
  "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556,
  "@": 1015, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722,
  I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
  j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
  s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of s) w += WIDTHS[ch] ?? 556;
  return (w / 1000) * size * (bold ? 1.02 : 1);
}

/** ASCII-safe + PDF-escape a string (₦ → N, — → -, ’ → ', etc). */
function sanitize(s: string): string {
  return s
    .replace(/₦/g, "N")
    .replace(/[—–]/g, "-")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function truncateToWidth(s: string, size: number, max: number, bold = false): string {
  const clean = sanitize(s);
  if (textWidth(clean, size, bold) <= max) return clean;
  let out = clean;
  while (out.length > 1 && textWidth(`${out}...`, size, bold) > max) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

export class ReceiptPdf {
  readonly width: number;
  readonly height: number;
  private y: number;
  private ops: string[] = [];

  constructor(opts: PdfOptions = {}) {
    this.width = opts.width ?? PAGE_W;
    this.height = opts.height ?? PAGE_H;
    this.y = this.height - MARGIN;
  }

  /** Move the cursor down; returns false if the page content area is exhausted. */
  get cursor(): number {
    return this.y;
  }

  ensure(space: number): boolean {
    return this.y - space >= MARGIN;
  }

  text(
    s: string,
    opts: { size?: number; bold?: boolean; align?: "left" | "center" | "right"; x?: number; max?: number } = {},
  ): void {
    const size = opts.size ?? 8;
    const bold = opts.bold ?? false;
    const clean = opts.max ? truncateToWidth(s, size, opts.max, bold) : sanitize(s);
    const w = textWidth(clean, size, bold);
    let x = opts.x ?? MARGIN;
    if (opts.align === "center") x = (this.width - w) / 2;
    if (opts.align === "right") x = this.width - MARGIN - w;
    this.y -= size * 1.25;
    this.ops.push(
      `BT /${bold ? FONT_BOLD : FONT} ${size} Tf ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${clean}) Tj ET`,
    );
  }

  line(opts: { dashed?: boolean; inset?: number } = {}): void {
    const inset = opts.inset ?? 0;
    this.y -= 6;
    this.ops.push(
      `${MARGIN + inset} ${this.y} m ${this.width - MARGIN - inset} ${this.y} l ` +
        `${opts.dashed ? "[2 2] 0 d" : ""} 0.6 w S`,
    );
    this.y -= 4;
  }

  gap(n = 4): void {
    this.y -= n;
  }

  /** Row with a left label and right-aligned value on the same baseline. */
  row(left: string, right: string, opts: { size?: number; bold?: boolean } = {}): void {
    const size = opts.size ?? 8;
    const bold = opts.bold ?? false;
    const rw = textWidth(sanitize(right), size, bold);
    this.y -= size * 1.25; // single baseline step for the whole row

    const cleanLeft = truncateToWidth(
      left,
      size,
      this.width - MARGIN * 2 - rw - 6,
      bold,
    );
    this.ops.push(
      `BT /${bold ? FONT_BOLD : FONT} ${size} Tf ${MARGIN.toFixed(2)} ${this.y.toFixed(2)} Td (${cleanLeft}) Tj ET`,
    );
    const x = this.width - MARGIN - rw;
    this.ops.push(
      `BT /${bold ? FONT_BOLD : FONT} ${size} Tf ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${sanitize(right)}) Tj ET`,
    );
  }

  build(title: string): Buffer {
    const content = this.ops.join("\n");
    const objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width.toFixed(2)} ${this.height.toFixed(2)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT} /Encoding /WinAnsiEncoding >>`,
      `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_BOLD} /Encoding /WinAnsiEncoding >>`,
      "<< /Title (" + sanitize(title) + ") >>",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(Buffer.byteLength(pdf, "latin1"));
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return Buffer.from(pdf, "latin1");
  }
}
