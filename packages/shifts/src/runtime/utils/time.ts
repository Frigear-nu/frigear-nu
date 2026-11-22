// Shift slots and countdowns on top of the zoned-time helpers of `@frigear-nu/module-kit/time`.
import { addDays, zonedTimeToUtc } from '@frigear-nu/module-kit/time'
import { appTimeZoneOf } from '@frigear-nu/ui/utils'

/**
 * The time zone shift times are entered and shown in: the `shifts.timeZone` override when set, else the app's
 * (`appConfig.frigearUi.timeZone`), else `UTC`. Pass `useAppConfig()` (Vue) or `useAppConfig(event)` (Nitro).
 */
export function resolveShiftsTimeZone(override: string | undefined | null, appConfig: unknown): string {
  return override || appTimeZoneOf(appConfig) || 'UTC'
}

/**
 * The start and end of one bulk slot on a day: an end at or before the start is on the next day (a night shift,
 * `22:00`–`04:00`).
 */
export function slotInstants(day: string, slot: { start: string, end: string }, timeZone: string): { startsAt: Date, endsAt: Date } {
  const startsAt = zonedTimeToUtc(day, slot.start, timeZone)
  const endDay = slot.end <= slot.start ? addDays(day, 1) : day
  return { startsAt, endsAt: zonedTimeToUtc(endDay, slot.end, timeZone) }
}

/** The whole days, hours and minutes left in a span, rounded up to the next minute (a countdown shows "1 min" until it is over). */
export function countdownParts(ms: number): { days: number, hours: number, minutes: number } {
  const total = Math.max(0, Math.ceil(ms / 60_000))
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 }
}
