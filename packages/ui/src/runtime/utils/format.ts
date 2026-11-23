import type { DateValue } from '../types'
import { joinNoBreakParts } from '../shared/spaces'

// Date and time formatting with `Intl`. Pages use these (or `useFormat()`, which binds the active locale)
// instead of ad-hoc `toLocaleString()` calls. Empty or invalid values format as an empty string.
//
// Every helper puts U+00A0 (no-break) where ICU versions put different spaces (`joinNoBreakParts`), so server and
// browser render the same text and a time or a range stays on one line.

const asDate = (value: DateValue | null | undefined): Date | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const format = (value: DateValue | null | undefined, locale: string | undefined, options: Intl.DateTimeFormatOptions) => {
  const date = asDate(value)
  return date ? joinNoBreakParts(new Intl.DateTimeFormat(locale, options).formatToParts(date)) : ''
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
  return joinNoBreakParts(new Intl.DateTimeFormat(locale, resolved).formatRangeToParts(from, to))
}

/**
 * The app's time zone, `appConfig.frigearUi.timeZone` (an IANA zone such as `America/New_York`), or `undefined` when
 * the app sets none or the zone is not one `Intl` knows (a typo such as `Europe/Copenhagn`, warned once in
 * development), so a bad setting never makes the formatters throw. Pass the app config: `useAppConfig()` in the Vue
 * app, `useAppConfig(event)` in Nitro, so server code (emails, tasks) formats in the same zone as the pages.
 */
export function appTimeZoneOf(appConfig: unknown): string | undefined {
  const timeZone = (appConfig as { frigearUi?: { timeZone?: unknown } } | null | undefined)?.frigearUi?.timeZone
  if (typeof timeZone !== 'string' || !timeZone) return undefined
  return validTimeZone(timeZone) ? timeZone : undefined
}

// Each zone is checked once per process: `Intl.DateTimeFormat` throws a RangeError for a zone it does not know.
const checkedZones = new Map<string, boolean>()

function validTimeZone(timeZone: string): boolean {
  let valid = checkedZones.get(timeZone)
  if (valid === undefined) {
    try {
      new Intl.DateTimeFormat('en', { timeZone })
      valid = true
    }
    catch {
      valid = false
      if (import.meta.dev) console.warn(`[@frigear-nu/ui] appConfig.frigearUi.timeZone "${timeZone}" is not a valid IANA time zone: the runtime's own zone is used.`)
    }
    checkedZones.set(timeZone, valid)
  }
  return valid
}
