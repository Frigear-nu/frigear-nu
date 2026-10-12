/** Formats an amount in a currency's minor unit (e.g. cents, øre) for display. */
export function formatMinorAmount(amount: number, currency: string, locale?: string): string {
  const upper = currency.toUpperCase()
  try {
    const formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: upper })
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2
    return formatter.format(amount / 10 ** digits)
  }
  catch {
    return `${(amount / 100).toFixed(2)} ${upper}`
  }
}
