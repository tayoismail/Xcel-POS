/**
 * Role-based access control for Xcel.
 *
 * Roles:
 *  - STAFF:   POS terminal, view sales/products/customers, quotations for own records.
 *  - MANAGER: everything STAFF can do, plus stock/products/purchases/invoices/expenses/
 *             production/accounts/reports and managerial sale actions (edit, refund, delete).
 *  - OWNER:   full access (settings, team, destructive finance actions).
 */
import type { UserRole } from "@prisma/client";

export type Role = UserRole;

export type Permission =
  // POS / selling
  | "pos.use"
  | "sales.view"
  | "sales.edit"
  | "sales.refund"
  | "sales.delete"
  // catalog
  | "products.view"
  | "products.manage"
  // stock
  | "stock.view"
  | "stock.adjust"
  | "stock.transfer"
  | "stock.production"
  // documents & money
  | "invoices.manage"
  | "purchases.manage"
  | "quotations.manage"
  | "expenses.manage"
  | "accounts.manage"
  // oversight
  | "reports.view"
  | "audit.view"
  | "settings.manage"
  | "team.manage";

export function can(
  role: Role,
  permission: Permission,
  ctx?: { ownRecord?: boolean },
): boolean {
  switch (permission) {
    case "pos.use":
    case "sales.view":
    case "products.view":
    case "stock.view":
      return true;
    case "sales.edit":
    case "sales.refund":
    case "sales.delete":
    case "products.manage":
    case "stock.adjust":
      return role === "OWNER" || role === "MANAGER";
    case "stock.transfer":
    case "stock.production":
    case "invoices.manage":
    case "purchases.manage":
    case "quotations.manage":
    case "expenses.manage":
    case "accounts.manage":
      // STAFF may manage only their own records (e.g. quotations they created),
      // which callers enforce by passing ctx.ownRecord.
      return role === "STAFF" ? ctx?.ownRecord === true : true;
    case "reports.view":
    case "audit.view":
      return role !== "STAFF";
    case "settings.manage":
    case "team.manage":
      return role === "OWNER";
    default:
      return false;
  }
}

export function isManagerLike(role: Role): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function assertCan(
  role: Role,
  permission: Permission,
  ctx?: { ownRecord?: boolean },
): void {
  if (!can(role, permission, ctx)) {
    throw new Error(`Forbidden: your role (${role}) cannot perform "${permission}"`);
  }
}
