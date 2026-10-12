// Money helpers for `CurrencyInput` / `MoneyInput`. Lives outside `runtime/utils` on purpose: that folder is
// auto-imported into host apps, and these names (`fromCents`, `toCents`) are generic enough to clash.

export type Currency = {
  name?: string
  code: string
  symbol: string
}

/** The number of minor-unit digits of a currency (2 for EUR, 0 for JPY, 3 for KWD), from `Intl`. */
export function currencyDigits(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  }
  catch {
    return 2
  }
}

/** Minor units (cents) to the major-unit number shown in an input. */
export function fromCents(amount: number | null | undefined, code = 'EUR'): number | null | undefined {
  if (amount === null || amount === undefined) return amount
  return amount / 10 ** currencyDigits(code)
}

/** The major-unit number from an input to minor units (cents), rounded to whole minor units. */
export function toCents(value: number | null | undefined, code = 'EUR'): number | null | undefined {
  if (value === null || value === undefined || Number.isNaN(value)) return null
  return Math.round(value * 10 ** currencyDigits(code))
}

/** Every ISO currency the runtime knows, with its localized name and symbol, sorted by code. */
export function currencyOptions(locale = 'en'): Currency[] {
  const codes: string[] = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR', 'USD', 'GBP', 'DKK', 'SEK', 'NOK']
  const names = new Intl.DisplayNames([locale], { type: 'currency' })
  return codes.map((code) => {
    const symbol = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find(part => part.type === 'currency')?.value ?? code
    return { code, symbol, name: names.of(code) ?? code }
  })
}
