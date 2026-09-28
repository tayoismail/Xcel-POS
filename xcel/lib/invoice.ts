import { randomUUID } from "crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type InvoiceDocKind = "SALE" | "INVOICE" | "QUOTATION" | "PURCHASE";

/** Prisma error code for a violated unique constraint. */
const UNIQUE_VIOLATION = "P2002";

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === UNIQUE_VIOLATION;
}

/** Where each document kind lives and how its numbers are prefixed. */
const KINDS: Record<
  InvoiceDocKind,
 { table: Prisma.Sql; column: string; prefix: string }
> = {
  SALE: { table: Prisma.sql`"Sale"`, column: "invoiceNo", prefix: "INV" },
  INVOICE: { table: Prisma.sql`"Invoice"`, column: "number", prefix: "BILL" },
  QUOTATION: { table: Prisma.sql`"Quotation"`, column: "number", prefix: "QTN" },
  PURCHASE: { table: Prisma.sql`"Purchase"`, column: "referenceNo", prefix: "PUR" },
};

/**
 * Highest numeric suffix already used for this kind, e.g. INV-0127 -> 127.
 * Lets the counter self-heal after manual imports/edits instead of colliding.
 */
async function legacyMax(
  client: Prisma.TransactionClient | PrismaClient,
  businessId: string,
  kind: InvoiceDocKind,
): Promise<number> {
  const { table, column, prefix } = KINDS[kind];
  const col = Prisma.raw(`"${column}"`);
  const rows = await client.$queryRaw<{ n: string | null }[]>`
    SELECT MAX(CAST(NULLIF(regexp_replace(${col}, '\\D', '', 'g'), '') AS integer)) AS n
    FROM ${table}
    WHERE "businessId" = ${businessId} AND ${col} LIKE ${prefix + "-%"}
  `;
  return Math.max(0, Number(rows[0]?.n ?? 0));
}

/**
 * Atomically reserve the next document number for (businessId, kind).
 *
 * A dedicated counter row is upserted as ONE raw SQL statement, so the
 * read-modify-write is atomic — two concurrent checkouts can never observe the
 * same value. The old approach ("read the last sale, add 1") let two
 * transactions read the same invoiceNo and crash on
 * @@unique([businessId, invoiceNo]) with "Unique constraint failed".
 *
 * Each call re-seeds from the highest number already stored on document rows,
 * so the counter can never fall behind reality. RETURNING hands back the
 * reserved number directly — no follow-up read, no off-by-one.
 *
 * Pass a transaction `client` to reserve within an existing transaction;
 * omit it to reserve standalone (recommended before opening a transaction,
 * so the counter's row lock is never held across long writes).
 */
export async function nextDocumentNumber(
  businessId: string,
  kind: InvoiceDocKind = "SALE",
  client: Prisma.TransactionClient | PrismaClient = prisma,
): Promise<string> {
  const { prefix } = KINDS[kind];
  const floor = Prisma.sql`GREATEST("InvoiceCounter"."nextNumber" + 1, ${await legacyMax(client, businessId, kind) + 1})`;

  const rows = await client.$queryRaw<{ nextNumber: number }[]>`
    INSERT INTO "InvoiceCounter" ("id", "businessId", "kind", "nextNumber", "updatedAt")
    VALUES (${randomUUID()}, ${businessId}, ${kind}::"InvoiceDocKind", ${1}, now())
    ON CONFLICT ("businessId", "kind")
    DO UPDATE SET "nextNumber" = ${floor}, "updatedAt" = now()
    RETURNING "nextNumber"
  `;
  const n = Number(rows[0]?.nextNumber ?? 0);
  if (n <= 0) throw new Error(`Failed to reserve the next ${kind} number.`);

  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Reserves a number, runs `fn` inside a transaction with it, and retries on
 * unique-constraint violations. Belt-and-braces for the case where a counter
 * row is reset or desynced by a data import: the transaction replays with a
 * freshly reserved number instead of surfacing P2002 to the user.
 *
 * `txOptions` is forwarded to `prisma.$transaction` — callers doing batched
 * writes over a pooled connection (Supabase/pgBouncer) should raise the
 * default 5s timeout (e.g. `{ timeout: 15_000, maxWait: 10_000 }`) so the
 * transaction is never reaped mid-flight ("Transaction not found").
 */
export async function withDocumentNumberRetry<T>(
  fn: (tx: Prisma.TransactionClient, docNo: string) => Promise<T>,
  opts: {
    businessId: string;
    kind?: InvoiceDocKind;
    attempts?: number;
    txOptions?: { timeout?: number; maxWait?: number };
  },
): Promise<T> {
  const { businessId, kind = "SALE", attempts = 5, txOptions } = opts;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const docNo = await nextDocumentNumber(businessId, kind);
    try {
      return await prisma.$transaction((tx) => fn(tx, docNo), txOptions);
    } catch (e) {
      lastError = e;
      if (!isUniqueViolation(e)) throw e;
      // Document-number collision — loop reserves a fresh one and retries.
    }
  }
  throw lastError;
}
