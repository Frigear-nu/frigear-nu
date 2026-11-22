// `@frigear-nu/module-kit/time`: wall-clock times in an IANA time zone, with `Intl` only (no date library), so a time
// staff typed in the app's zone becomes the right instant across daylight saving changes, on any runtime.

const DAY = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterOf(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** Whether `timeZone` is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterOf(timeZone)
    return true
  }
  catch {
    return false
  }
}

/** The wall-clock parts of an instant in a time zone. */
export function zonedParts(instant: Date | number, timeZone: string): { year: number, month: number, day: number, hour: number, minute: number, second: number } {
  const parts = Object.fromEntries(formatterOf(timeZone).formatToParts(new Date(instant)).map(part => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** How far the time zone is ahead of UTC at an instant, in milliseconds. */
export function zoneOffset(instant: Date | number, timeZone: string): number {
  const time = new Date(instant).getTime()
  const p = zonedParts(time, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(time / 1000) * 1000
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

/** Whether a value is a `YYYY-MM-DD` day that exists on the calendar (`2027-02-30` and `2026-02-29` are not). */
export function isDay(value: string): boolean {
  const [, y, m, d] = DATE_PATTERN.exec(value) ?? []
  if (!y) return false
  const date = new Date(0)
  date.setUTCFullYear(Number(y), Number(m) - 1, Number(d))
  return date.toISOString().slice(0, 10) === value
}
/** Whether a value is an `HH:mm` time. */
export const isClock = (value: string) => TIME_PATTERN.test(value)

/**
 * The instant of a wall-clock time in a time zone: `2027-06-28` at `18:00` in `Europe/Berlin` is 16:00 UTC.
 *
 * Around a daylight saving change it behaves like Temporal's `compatible` disambiguation:
 * - a time the clocks skip (the spring-forward gap, 02:30 on 2027-03-28 in Berlin) moves forward by the length of the
 *   gap: it is read with the offset in force before the change, so it lands on 03:30 summer time (01:30 UTC);
 * - a time the clocks repeat (the fall-back overlap, 02:30 on 2027-10-31 in Berlin) is the earlier of the two
 *   instants, the first time the clock shows it (00:30 UTC).
 *
 * Throws on a malformed day or time, and on a day that does not exist (`2027-02-30`).
 */
export function zonedTimeToUtc(day: string, clock: string, timeZone: string): Date {
  const [, y, m, d] = DATE_PATTERN.exec(day) ?? []
  const [, hh, mm] = TIME_PATTERN.exec(clock) ?? []
  if (!y || !hh || !isDay(day)) throw new Error(`Invalid day or time: ${day} ${clock}`)
  const date = new Date(0)
  date.setUTCFullYear(Number(y), Number(m) - 1, Number(d))
  date.setUTCHours(Number(hh), Number(mm), 0, 0)
  const wall = date.getTime()
  // The offsets on either side of any change near this time. A candidate instant is real only when the zone's offset
  // at that instant is the offset it was computed with.
  const before = zoneOffset(wall - DAY, timeZone)
  const after = zoneOffset(wall + DAY, timeZone)
  const candidates = [...new Set([before, after])]
    .map(offset => wall - offset)
    .filter(time => zoneOffset(time, timeZone) === wall - time)
  // Two real instants: the overlap, take the earlier. None: the gap, read it with the offset before the change.
  return new Date(candidates.length ? Math.min(...candidates) : wall - before)
}

/** The `YYYY-MM-DD` day an instant falls on in a time zone. */
export function dayKey(instant: Date | number | string, timeZone: string): string {
  const p = zonedParts(new Date(instant), timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** The `HH:mm` wall-clock time of an instant in a time zone. */
export function clockOf(instant: Date | number | string, timeZone: string): string {
  const p = zonedParts(new Date(instant), timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** A `YYYY-MM-DD` day plus `days`. */
export function addDays(day: string, days: number): string {
  const time = Date.parse(`${day}T00:00:00Z`) + days * DAY
  return new Date(time).toISOString().slice(0, 10)
}

/** An instant moved by whole days at the same wall-clock time in a time zone (copying a schedule a year on). */
export function shiftByDays(instant: Date, days: number, timeZone: string): Date {
  if (!days) return new Date(instant)
  return zonedTimeToUtc(addDays(dayKey(instant, timeZone), days), clockOf(instant, timeZone), timeZone)
}
