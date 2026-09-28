/**
 * Schema-drift guard.
 *
 * Compares the live database against prisma/schema.prisma and fails (exit 1)
 * when they differ, so a forgotten migration/db push is caught in CI instead
 * of surfacing as a runtime 42P01 "relation does not exist" style error.
 *
 * Local usage:   npm run db:check          (DATABASE_URL from .env)
 * CI usage:      npm run db:check          (DATABASE_URL from the environment)
 *
 * Uses `prisma migrate diff --exit-code`: exit 0 = identical, 2 = drift.
 * The datasource is taken from prisma/schema.prisma so directUrl handling
 * matches `prisma migrate status` exactly.
 */
import { spawnSync } from "child_process";
import { createRequire } from "module";

// Invoke the Prisma CLI JS directly with the current Node binary — avoids
// spawning npx(.cmd), which fails on Windows under Node >= 18.20 (EINVAL).
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

const res = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code",
  ],
  { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);

const output = ((res.stdout ?? "") + (res.stderr ?? ""))
  .split("\n")
  .filter((l) => !l.includes("deprecated") && !l.includes("prisma-config"))
  .join("\n")
  .trim();
const DRIFT_EXIT = 2;

if (res.status === 0) {
  console.log("✓ Database schema matches prisma/schema.prisma — no drift.");
  process.exit(0);
}

if (res.status === DRIFT_EXIT) {
  console.error(
    "✗ SCHEMA DRIFT DETECTED — the database does not match prisma/schema.prisma.\n",
  );
  console.error("Required changes:\n");
  console.error(output);
  console.error(
    "\nFix locally with:  npx prisma db push   (or: npx prisma migrate dev --name <change>)",
  );
  process.exit(1);
}

console.error("✗ Drift check could not run:\n" + output.slice(0, 2000));
process.exit(1);
