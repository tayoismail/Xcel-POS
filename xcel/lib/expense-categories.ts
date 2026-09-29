/**
 * Expense categories used by the expense form and filters.
 *
 * Lives in a plain module (NOT a "use server" file) — Next.js only allows
 * async function exports in server-action modules, and a non-function export
 * gets rewritten into a server-reference proxy, which crashes `.map()` calls.
 */
export const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Internet",
  "Salaries",
  "Transport",
  "Repairs",
  "Marketing",
  "Supplies",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
