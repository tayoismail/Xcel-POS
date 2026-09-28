/**
 * Concurrency test for lib/invoice.ts (atomic per-business document numbering).
 *
 * Simulates N staff members clicking "Complete sale" at the same instant: N
 * parallel nextDocumentNumber() calls for the same business. Verifies that
 * every reservation is unique, strictly sequential, and never reissued —
 * plus a full withDocumentNumberRetry() round-trip through a real sale row.
 *
 * Run with:  npx tsx scripts/test-invoice-concurrency.ts
 *
 * Creates and deletes its own throwaway business; touches nothing else.
 */
import { PrismaClient } from "@prisma/client";

import { nextDocumentNumber, withDocumentNumberRetry } from "../lib/invoice";

const prisma = new PrismaClient();
const N = 24; // parallel reservations per wave

async function main() {
  // ---------------------------------------------------------- throwaway business
  const business = await prisma.business.create({
    data: { name: `counter-test-${Date.now()}` },
    select: { id: true, name: true },
  });
  const location = await prisma.location.create({
    data: { businessId: business.id, name: "Test Location" },
    select: { id: true },
  });

  try {
    // ------------------------------------------------------------- wave 1: N parallel reservations
    const wave1 = await Promise.all(
      Array.from({ length: N }, () => nextDocumentNumber(business.id, "SALE")),
    );
    const unique1 = new Set(wave1);
    if (unique1.size !== N) {
      throw new Error(`DUPLICATES in wave 1: ${N} calls produced ${unique1.size} unique numbers`);
    }
    const nums1 = wave1
      .map((s) => Number(s.replace(/\D/g, "")))
      .sort((a, b) => a - b);
    for (let i = 1; i < nums1.length; i++) {
      if (nums1[i] !== nums1[i - 1] + 1) {
        throw new Error(`GAP in wave 1: ${nums1[i - 1]} -> ${nums1[i]} (numbers must be strictly sequential)`);
      }
    }
    console.log(`wave 1: ${N} parallel reservations → all unique ✓  strictly sequential ✓  (last: ${wave1[0]})`);

    // --------------------------------------------- wave 2: legacy self-heal seeding
    // A pre-existing sale row with a HIGH number must drag the counter past it.
    const highNo = "INV-9000";
    const product = await prisma.product.create({
      data: {
        businessId: business.id,
        name: "Test product",
        sku: `TST-${Date.now()}`,
        price: 100,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    await prisma.sale.create({
      data: {
        businessId: business.id,
        locationId: location.id,
        invoiceNo: highNo,
        soldById: (
          await prisma.user.create({
            data: {
              businessId: business.id,
              email: `counter-test-${Date.now()}@example.com`,
              name: "Counter Test",
              role: "OWNER",
            },
            select: { id: true },
          })
        ).id,
        totalAmount: 100,
        totalPaid: 100,
        due: 0,
        itemsCount: 1,
        items: { create: { productId: product.id, qty: 1, unitPrice: 100, subtotal: 100 } },
      },
      select: { id: true },
    });

    const afterSeed = await nextDocumentNumber(business.id, "SALE");
    const afterSeedNum = Number(afterSeed.replace(/\D/g, ""));
    if (afterSeedNum <= 9000) {
      throw new Error(`SELF-HEAL FAILED: expected a number > INV-9000, got ${afterSeed}`);
    }
    console.log(`wave 2: counter self-healed past legacy ${highNo} → next is ${afterSeed} ✓`);

    // --------------------------------- wave 3: N parallel reservations on the healed counter
    const wave3 = await Promise.all(
      Array.from({ length: N }, () => nextDocumentNumber(business.id, "SALE")),
    );
    const unique3 = new Set(wave3);
    if (unique3.size !== N) {
      throw new Error(`DUPLICATES in wave 3: ${N} calls produced ${unique3.size} unique numbers`);
    }
    console.log(`wave 3: ${N} parallel reservations on healed counter → all unique ✓`);

    // ------------------------------- wave 4: full retry-helper round-trip (parallel sales)
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        withDocumentNumberRetry(
          async (tx, invoiceNo) => {
            const sale = await tx.sale.create({
              data: {
                businessId: business.id,
                locationId: location.id,
                invoiceNo,
                soldById: (await tx.user.findFirstOrThrow({
                  where: { businessId: business.id },
                  select: { id: true },
                })).id,
                totalAmount: 10 + i,
                totalPaid: 10 + i,
                due: 0,
                itemsCount: 1,
                items: { create: { productId: product.id, qty: 1, unitPrice: 10 + i, subtotal: 10 + i } },
              },
              select: { id: true, invoiceNo: true },
            });
            return sale.invoiceNo;
          },
          { businessId: business.id, kind: "SALE" },
        ),
      ),
    );
    if (new Set(results).size !== results.length) {
      throw new Error(`DUPLICATE invoice numbers written via withDocumentNumberRetry: ${results.join(", ")}`);
    }
    const dbRows = await prisma.sale.findMany({
      where: { businessId: business.id, invoiceNo: { startsWith: "INV-" } },
      select: { invoiceNo: true },
    });
    const dbNums = dbRows.map((r) => Number(r.invoiceNo.replace(/\D/g, "")));
    if (new Set(dbNums).size !== dbNums.length) {
      throw new Error("DUPLICATE invoice numbers found in the Sale table");
    }
    console.log(`wave 4: 8 parallel withDocumentNumberRetry sales → all persisted with unique invoice numbers ✓`);

    console.log(`\nALL CONCURRENCY CHECKS PASSED (${2 * N + 8} reservations, 0 duplicates)`);
  } finally {
    // ------------------------------------------------------------- cleanup (children first)
    const testSaleIds = (
      await prisma.sale.findMany({ where: { businessId: business.id }, select: { id: true } })
    ).map((s) => s.id);
    await prisma.stockMovement.deleteMany({ where: { referenceId: { in: testSaleIds } } });
    await prisma.payment.deleteMany({ where: { sale: { businessId: business.id } } });
    await prisma.saleItem.deleteMany({ where: { sale: { businessId: business.id } } });
    await prisma.sale.deleteMany({ where: { businessId: business.id } });
    await prisma.product.deleteMany({ where: { businessId: business.id } });
    await prisma.user.deleteMany({ where: { businessId: business.id } });
    await prisma.location.deleteMany({ where: { businessId: business.id } });
    await prisma.invoiceCounter.deleteMany({ where: { businessId: business.id } });
    await prisma.business.delete({ where: { id: business.id } });
  }
}

main()
  .catch((e) => {
    console.error("\nCONCURRENCY TEST FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
