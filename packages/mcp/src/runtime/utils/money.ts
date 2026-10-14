// MCP tools speak in whole currency units (52.2 = 52.20 DKK), never in minor units: an agent reading `5220` cannot
// tell 5220 USD from 52.20 USD. Storage and REST stay in minor units; tools convert at the edge with these.

/** Standing sentence for descriptions and `describe()` texts of money fields. */
export const MONEY_NOTICE = 'Whole currency units, not cents: 52.2 means 52.20 of the currency (JPY has no decimals).'

/** The number of minor-unit digits of a currency (2 for EUR, 0 for JPY, 3 for KWD). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2
  }
  catch {
    return 2
  }
}

/** Minor units (cents) to the major-unit number agents see, e.g. `fromCents(5220, 'USD')` -> `52.2`. */
export function fromCents(amount: number, currency: string): number
export function fromCents(amount: number | null | undefined, currency: string): number | null
export function fromCents(amount: number | null | undefined, currency: string): number | null {
  if (amount === null || amount === undefined) return null
  return Number((amount / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency)))
}

/** A major-unit number from an agent to whole minor units (cents), e.g. `toCents(52.2, 'USD')` -> `5220`. */
export function toCents(value: number, currency: string): number {
  if (!Number.isFinite(value)) throw new TypeError('Amount must be a finite number.')
  return Math.round(value * 10 ** currencyDigits(currency))
}

/** Returns a copy of `row` with its `fields` converted from minor to major units. */
export function fieldsFromCents<T extends Record<string, unknown>>(row: T, fields: Array<keyof T & string>, currency: string): T {
  const out: Record<string, unknown> = { ...row }
  for (const field of fields) {
    const value = out[field]
    if (typeof value === 'number') out[field] = fromCents(value, currency)
  }
  return out as T
}
