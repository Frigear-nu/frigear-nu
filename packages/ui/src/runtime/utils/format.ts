import type { DateValue } from '../types'

// Date and time formatting with `Intl`. Pages use these (or `useFormat()`, which binds the active locale)
// instead of ad-hoc `toLocaleString()` calls. Empty or invalid values format as an empty string.

const asDate = (value: DateValue | null | undefined): Date | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const format = (value: DateValue | null | undefined, locale: string | undefined, options: Intl.DateTimeFormatOptions) => {
  const date = asDate(value)
  return date ? new Intl.DateTimeFormat(locale, options).format(date) : ''
}

/** "15 Oct 2026" */
export function formatDate(value: DateValue | null | undefined, locale?: string, options: Intl.DateTimeFormatOptions = {}): string {
  return format(value, locale, { dateStyle: 'medium', ...options })
}

/** "15 Oct 2026, 10:00" */
export function formatDateTime(value: DateValue | null | undefined, locale?: string, options: Intl.DateTimeFormatOptions = {}): string {
  return format(value, locale, { dateStyle: 'medium', timeStyle: 'short', ...options })
}

/** "10:00" */
export function formatTime(value: DateValue | null | undefined, locale?: string, options: Intl.DateTimeFormatOptions = {}): string {
  return format(value, locale, { timeStyle: 'short', ...options })
}

/**
 * "15–17 Oct 2026", collapsing the parts both ends share. Without `end` (or with an invalid one) it is
 * `formatDate(start)`. Pass `{ dateStyle: 'medium', timeStyle: 'short' }` to include times.
 */
export function formatDateRange(start: DateValue | null | undefined, end: DateValue | null | undefined, locale?: string, options: Intl.DateTimeFormatOptions = {}): string {
  const from = asDate(start)
  const to = asDate(end)
  const resolved: Intl.DateTimeFormatOptions = { dateStyle: 'medium', ...options }
  if (!from) return to ? format(to, locale, resolved) : ''
  if (!to || to.getTime() < from.getTime()) return format(from, locale, resolved)
  return new Intl.DateTimeFormat(locale, resolved).formatRange(from, to)
}
