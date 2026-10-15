import { useAppConfig } from '#imports'
import type { DateValue } from '../types'
import { formatDate, formatDateRange, formatDateTime, formatTime } from '../utils/format'
import { formatMoney } from '../shared/money'
import { useTranslatedLocale } from './useTranslatedLocales'

type FormatAppConfig = { frigearUi?: { timeZone?: string } }

/**
 * The date and money formatters bound to the active locale (`@nuxtjs/i18n`'s when installed, otherwise `en`) and to
 * the app's time zone (`appConfig.frigearUi.timeZone`, e.g. `Europe/Copenhagen`), so server and client render the
 * same text. Without a configured time zone the runtime's own is used, which differs between a UTC server and a
 * visitor's browser: set it in the host app.
 *
 * ```ts
 * const format = useFormat()
 * format.date(event.startsAt) // "15 Oct 2026"
 * format.money(15000, 'DKK') // "DKK 150.00"
 * ```
 */
export function useFormat() {
  const locale = useTranslatedLocale()
  const timeZone = (useAppConfig() as FormatAppConfig).frigearUi?.timeZone
  type Value = DateValue | null | undefined
  type Options = Intl.DateTimeFormatOptions
  const withZone = (options?: Options): Options => (timeZone ? { timeZone, ...options } : { ...options })

  return {
    locale,
    timeZone,
    date: (value: Value, options?: Options) => formatDate(value, locale.value, withZone(options)),
    dateTime: (value: Value, options?: Options) => formatDateTime(value, locale.value, withZone(options)),
    time: (value: Value, options?: Options) => formatTime(value, locale.value, withZone(options)),
    dateRange: (start: Value, end: Value, options?: Options) => formatDateRange(start, end, locale.value, withZone(options)),
    /** An amount in minor units (cents, øre) of `currency`. */
    money: (amount: number, currency: string) => formatMoney(amount, currency, locale.value),
  }
}
