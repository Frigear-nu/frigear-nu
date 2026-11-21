import type { ShiftGuards, ShiftWarning } from '../../types'
import { dayKey } from './time'

/** A shift as the guards see it: an id and a time. */
export type GuardShift = { id: string, startsAt: Date | string, endsAt: Date | string }

const time = (value: Date | string) => new Date(value).getTime()
const HOUR = 3_600_000

/**
 * The guards a person breaks by working `target` on top of `others` (their other `assigned`/`attended` shifts, the one
 * they give up in a swap left out): working more shifts on one day than `maxShiftsPerDay` (days in `timeZone`), less
 * rest than `minRestHours` between two shifts, and two shifts at once (always, without a guard).
 */
export function shiftGuardWarnings(target: GuardShift, others: readonly GuardShift[], guards: ShiftGuards | null | undefined, timeZone: string): ShiftWarning[] {
  const warnings: ShiftWarning[] = []
  const start = time(target.startsAt)
  const end = time(target.endsAt)
  const rest = guards?.minRestHours ? guards.minRestHours * HOUR : 0
  for (const other of others) {
    if (other.id === target.id) continue
    const otherStart = time(other.startsAt)
    const otherEnd = time(other.endsAt)
    if (otherStart < end && start < otherEnd) {
      warnings.push({ code: 'overlap', message: 'The person works another shift at the same time.', shiftId: other.id })
      continue
    }
    const gap = otherEnd <= start ? start - otherEnd : otherStart - end
    if (rest && gap < rest) {
      warnings.push({ code: 'min_rest', message: `Less than ${guards!.minRestHours} hours of rest between two shifts.`, shiftId: other.id })
    }
  }
  const max = guards?.maxShiftsPerDay
  if (max) {
    const day = dayKey(target.startsAt, timeZone)
    const sameDay = others.filter(other => other.id !== target.id && dayKey(other.startsAt, timeZone) === day).length
    if (sameDay + 1 > max) warnings.push({ code: 'max_shifts_per_day', message: `More than ${max} shift${max === 1 ? '' : 's'} on one day.` })
  }
  return warnings
}

/** The capacity that applies to a shift: its own, else the schedule's `maxPerShift`; `null` is unlimited. */
export const effectiveCapacity = (shift: { capacity: number | null }, schedule: { maxPerShift: number | null }): number | null =>
  shift.capacity ?? schedule.maxPerShift ?? null

/** The capacity warnings of a shift holding `filled` people (after an assignment): over the capacity, or short of the minimum. */
export function shiftCapacityWarnings(filled: number, capacity: number | null, minPerShift: number | null): ShiftWarning[] {
  const warnings: ShiftWarning[] = []
  if (capacity !== null && filled > capacity) warnings.push({ code: 'shift_full', message: `The shift takes ${capacity} people.` })
  if (minPerShift && filled < minPerShift) warnings.push({ code: 'below_min', message: `The shift needs at least ${minPerShift} people.` })
  return warnings
}
