/**
 * Generates public/icons/icon-192.png and public/icons/icon-512.png from the
 * Xcel logo mark. Run once with:  node scripts/generate-icons.mjs
 * (requires the optional "canvas" npm package: npm i -D canvas)
 */
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

async function main() {
  let createCanvas;
  try {
    ({ createCanvas } = await import("canvas"));
  } catch {
    console.error(
      "The 'canvas' package is required: npm i -D canvas && node scripts/generate-icons.mjs",
    );
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), "public", "icons");
  await mkdir(outDir, { recursive: true });

  for (const size of [192, 512]) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Emerald rounded square
    const r = size * 0.22;
    ctx.fillStyle = "#059669";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, r);
    ctx.fill();

    // White X mark
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = size * 0.11;
    ctx.lineCap = "round";
    const pad = size * 0.28;
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(size - pad, size - pad);
    ctx.moveTo(size - pad, pad);
    ctx.lineTo(pad, size - pad);
    ctx.stroke();

    const buf = canvas.toBuffer("image/png");
    await writeFile(path.join(outDir, `icon-${size}.png`), buf);
    console.log(`wrote public/icons/icon-${size}.png`);
  }
}

main();
