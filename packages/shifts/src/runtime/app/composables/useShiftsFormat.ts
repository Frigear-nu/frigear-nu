import { useFormat, useRuntimeConfig } from '#imports'

/**
 * Date formatters for shift times, in the module's time zone (`shifts.timeZone`), so every viewer sees the local times of
 * the operation, whatever their own time zone: `time`, `range` (a shift's start and end with the date) and `day` (a
 * `YYYY-MM-DD` day as a long date).
 */
export function useShiftsFormat() {
  const format = useFormat()
  const timeZone = useRuntimeConfig().public.shifts?.timeZone ?? 'Europe/Copenhagen'
  // Node's and the browser's ICU put different spaces (U+2009, U+202F) around range dashes and before AM/PM; plain
  // spaces make the server and the client render the same text.
  const plain = (text: string) => text.replace(/[\u2009\u202F]/g, ' ')
  return {
    timeZone,
    time: (value: string | Date) => plain(format.time(value, { timeZone })),
    dateTime: (value: string | Date) => plain(format.dateTime(value, { timeZone })),
    range: (start: string | Date, end: string | Date) => plain(format.dateRange(start, end, { dateStyle: 'medium', timeStyle: 'short', timeZone })),
    // Noon UTC stays on the same calendar day in every zone; `dateStyle` is cleared: it cannot be combined with parts.
    day: (day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
      plain(format.date(`${day}T12:00:00Z`, { dateStyle: undefined, timeZone: 'UTC', ...options })),
  }
}
