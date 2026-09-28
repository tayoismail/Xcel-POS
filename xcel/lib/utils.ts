export { cn } from "cn"

const NGN_LOCALE = "en-NG"

export type CurrencyOptions = { compact?: boolean }

/** Anything numeric-ish we render as money: primitives plus Prisma.Decimal. */
export type MoneyValue = string | number | bigint | { toString(): string } | null | undefined

/**
 * Single source of truth for money display. All amounts are Naira and every
 * money value in the UI must render through this so columns align and
 * formatting never drifts between screens.
 */
export function formatCurrency(value: MoneyValue, options?: CurrencyOptions): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return options?.compact ? "₦0" : "₦0.00"
  return `₦${n.toLocaleString(
    NGN_LOCALE,
    options?.compact
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`
}

/** Axis / KPI variant: drops the decimals (₦1.2M style figures stay readable). */
export function formatCurrencyCompact(value: MoneyValue): string {
  return formatCurrency(value, { compact: true })
}
