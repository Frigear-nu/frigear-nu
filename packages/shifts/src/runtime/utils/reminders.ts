// When a reminder is due, as pure functions (tested as a unit): `shiftsSendReminders` (server utils) does the sending.

const MINUTE = 60_000

/** The offsets reminders use unless the module sets its own: a day and two hours before a shift starts. */
export const DEFAULT_REMINDER_OFFSETS: readonly number[] = [1440, 120]

/** The longest offset: a week. */
export const MAX_REMINDER_OFFSET = 7 * 24 * 60

/** Cleans the `reminders.offsets` option: positive whole minutes up to a week, without duplicates, largest first. */
export function normalizeReminderOffsets(value: unknown): number[] {
  if (!Array.isArray(value)) return [...DEFAULT_REMINDER_OFFSETS]
  const offsets = value
    .map(item => Math.round(Number(item)))
    .filter(item => Number.isFinite(item) && item > 0 && item <= MAX_REMINDER_OFFSET)
  return [...new Set(offsets)].sort((a, b) => b - a)
}

/** The offsets (minutes) whose moment, `startsAt` minus the offset, has passed while the shift still lies ahead. */
export function dueReminderOffsets(startsAt: Date, offsets: readonly number[], now: Date): number[] {
  if (startsAt.getTime() <= now.getTime()) return []
  return offsets.filter(offset => startsAt.getTime() - offset * MINUTE <= now.getTime())
}

/**
 * The one offset to send when several are due at once (a late run, or a person assigned inside the window): the
 * smallest, which is the closest to the shift. The larger ones are then spent without a message of their own.
 */
export function reminderOffsetToSend(due: readonly number[]): number | undefined {
  return due.length ? Math.min(...due) : undefined
}

/** How many due assignments one reminder run handles unless `reminders.batchSize` says otherwise. */
export const DEFAULT_REMINDER_BATCH = 100

/** The most one run may handle: a Workers invocation has a budget of subrequests, so a run stays small. */
export const MAX_REMINDER_BATCH = 1000

/** Cleans the `reminders.batchSize` option: a whole number from 1 to 1000, else the default. */
export function normalizeReminderBatch(value: unknown): number {
  const size = Math.floor(Number(value))
  return Number.isFinite(size) && size >= 1 ? Math.min(size, MAX_REMINDER_BATCH) : DEFAULT_REMINDER_BATCH
}

/**
 * The real time left, as the reminder words it: minutes below an hour, whole hours (rounded) below a day, whole days
 * (rounded down) from there. The configured offset is when a reminder falls due, not how long is left when it is sent.
 */
export function timeLeftBucket(startsAt: Date, now: Date): { unit: 'minutes' | 'hours' | 'days', count: number } {
  const minutes = Math.max(1, Math.round((startsAt.getTime() - now.getTime()) / MINUTE))
  if (minutes < 60) return { unit: 'minutes', count: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 24) return { unit: 'hours', count: hours }
  return { unit: 'days', count: Math.max(1, Math.floor(minutes / 1440)) }
}
