import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "SALE_DELETE"
  | "SALE_REFUND"
  | "SALE_EDIT"
  | "STOCK_ADJUST"
  | "STOCK_TRANSFER"
  | "PRICE_CHANGE"
  | "PRODUCT_CREATE"
  | "PRODUCT_DELETE"
  | "ACCOUNT_ADJUST"
  | "ACCOUNT_TRANSFER"
  | "EXPENSE_CREATE"
  | "EXPENSE_DELETE"
  | "PURCHASE_CREATE"
  | "PURCHASE_RECEIVE"
  | "PRODUCTION_LOG"
  | "INVOICE_CANCEL";

type Entity =
  | "Sale"
  | "SaleItem"
  | "StockLevel"
  | "StockMovement"
  | "Product"
  | "BankAccount"
  | "Expense"
  | "Purchase"
  | "ProductionLog"
  | "Invoice";

/**
 * Record an important action in the audit trail. Never throws — auditing
 * must not break the business operation it describes.
 */
export async function audit(opts: {
  businessId: string;
  userId: string;
  action: AuditAction;
  entity: Entity;
  entityId?: string | null;
  summary: string;
  meta?: Prisma.InputJsonObject;
  /** Call inside the same prisma.$transaction as the mutation when possible. */
  tx?: Pick<Prisma.TransactionClient, "auditLog">;
}): Promise<void> {
  const { businessId, userId, action, entity, entityId, summary, meta, tx } = opts;
  try {
    const client = tx ?? prisma;
    await client.auditLog.create({
      data: {
        businessId,
        userId,
        action,
        entity,
        entityId: entityId ?? null,
        meta: meta ? { summary, ...meta } : { summary },
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", action, entity, err);
  }
}

/** Format a Decimal-ish money value for human-readable audit summaries. */
export { formatCurrency as money } from "@/lib/utils";
