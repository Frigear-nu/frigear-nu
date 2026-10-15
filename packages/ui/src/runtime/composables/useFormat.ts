import type { DateValue } from '../types'
import { formatDate, formatDateRange, formatDateTime, formatTime } from '../utils/format'
import { formatMoney } from '../shared/money'
import { useTranslatedLocale } from './useTranslatedLocales'

/**
 * The date and money formatters bound to the active locale (`@nuxtjs/i18n`'s when installed, otherwise `en`), so
 * server and client render the same text.
 *
 * ```ts
 * const format = useFormat()
 * format.date(event.startsAt) // "15 Oct 2026"
 * format.money(15000, 'DKK') // "DKK 150.00"
 * ```
 */
export function useFormat() {
  const locale = useTranslatedLocale()
  type Value = DateValue | null | undefined
  type Options = Intl.DateTimeFormatOptions

  return {
    locale,
    date: (value: Value, options?: Options) => formatDate(value, locale.value, options),
    dateTime: (value: Value, options?: Options) => formatDateTime(value, locale.value, options),
    time: (value: Value, options?: Options) => formatTime(value, locale.value, options),
    dateRange: (start: Value, end: Value, options?: Options) => formatDateRange(start, end, locale.value, options),
    /** An amount in minor units (cents, øre) of `currency`. */
    money: (amount: number, currency: string) => formatMoney(amount, currency, locale.value),
  }
}
