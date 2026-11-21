import type { ShiftWarning, Translated } from '../../../types'
import { clockOf, dayKey, zonedTimeToUtc } from '../../utils/time'

// The small shapes of the teams API the Shifts tab reads (shifts does not import teams' app code), and the date helpers
// of the schedule views.

/** A team of the operation, as `GET /api/admin/teams?ownerType=operation&ownerId=...` answers (the fields used here). */
export type ShiftsTeamOption = { id: string, kind: string, name: Translated }
/** A ladder as `GET /api/admin/teams/ladders` answers (the fields used here). */
export type ShiftsLadder = { kind: string, roles: Array<{ key: string, label: Translated }>, leadFrom: string | null }

type TranslateText = (value: Translated | null | undefined) => string

/** The select options of a kind's ladder, highest role first. */
export function shiftsRoleOptions(ladders: readonly ShiftsLadder[] | null | undefined, kind: string | undefined, tr: TranslateText) {
  const ladder = ladders?.find(item => item.kind === kind)
  return [...(ladder?.roles ?? [])].reverse().map(role => ({ label: tr(role.label) || role.key, value: role.key }))
}

/** The label of a role key on a ladder, falling back to the key. */
export function shiftsRoleLabel(ladders: readonly ShiftsLadder[] | null | undefined, kind: string | undefined, role: string, tr: TranslateText): string {
  const found = ladders?.find(ladder => ladder.kind === kind)?.roles.find(item => item.key === role)
  return found ? tr(found.label) || role : role
}

/**
 * Shift times are entered as wall-clock times in the module's time zone (`public.shifts.timeZone`), not the browser's:
 * a coordinator abroad still plans the festival's local hours. `toZonedInput` turns a stored instant into a
 * `datetime-local` value in that zone, `zonedInputToIso` turns one back.
 */
export const toZonedInput = (value: string | null | undefined, timeZone: string) => {
  if (!value) return ''
  return `${dayKey(value, timeZone)}T${clockOf(value, timeZone)}`
}

export const zonedInputToIso = (value: string, timeZone: string): string | null => {
  const [day, clock] = value.split('T')
  if (!day || !clock) return null
  return zonedTimeToUtc(day, clock.slice(0, 5), timeZone).toISOString()
}

/** Every `YYYY-MM-DD` day from `from` to `to`, both included (at most 62). */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  let time = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  while (!Number.isNaN(time) && time <= end && days.length < 62) {
    days.push(new Date(time).toISOString().slice(0, 10))
    time += 86_400_000
  }
  return days
}

/** The days shifts start on, in the time zone, sorted. */
export function shiftDays(shifts: ReadonlyArray<{ startsAt: string }>, timeZone: string): string[] {
  return [...new Set(shifts.map(shift => dayKey(shift.startsAt, timeZone)))].sort()
}

/** Minutes since local midnight of `day` in the time zone (may be below 0 or above 1440 for shifts crossing midnight). */
export function minutesInDay(value: string, day: string, timeZone: string): number {
  const midnight = zonedTimeToUtc(day, '00:00', timeZone).getTime()
  return Math.round((new Date(value).getTime() - midnight) / 60_000)
}

/** The colour of a guard warning. */
export const warningColor = (warning: ShiftWarning) => warning.code === 'shift_full' || warning.code === 'overlap' ? 'error' : 'warning'
