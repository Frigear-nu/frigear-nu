import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, gte, inArray, isNull, lt, ne } from 'drizzle-orm'
import { apiError, conflict, notFound } from '@frigear-nu/module-kit/server'
import type { ShiftAssignResultDto, ShiftAssignmentStatus, ShiftCheckInDto, ShiftCheckInMethod, ShiftSelfCheckInDto, ShiftSelfCheckInInput, ShiftWarning } from '../../../types'
import { newCheckInCode, newId } from '../../utils'
import { effectiveCapacity, shiftCapacityWarnings } from '../../utils/guards'
import { ACTIVE_ASSIGNMENT_STATUSES, canMoveAssignment } from '../../utils/status'
import { checkInRuleFor, checkLocation } from '../../utils/checkin'
import { addDays, dayKey, zonedTimeToUtc } from '@frigear-nu/module-kit/time'
import { toShiftAssignmentDto, toShiftDto } from './shifts-dto'
import type { ShiftAssignmentRow } from './shifts-dto'
import {
  findShiftAssignmentEntry,
  shiftsActiveAssignmentOf,
  shiftsAssigneeDtos,
  shiftsConfig,
  shiftsEligibility,
  shiftsFilledCount,
  shiftsFire,
  shiftsGuardWarningsFor,
  shiftsRoleById,
  shiftsRoleOfOr400,
} from './shifts-core'
import type { ShiftAssignmentEntry, ShiftEntry } from './shifts-core'
import { shiftsCancelSwapsOf } from './shifts-swaps'
import { shiftsEarnPerks, shiftsRevokeEarnedPerks } from './shifts-perks'
import { findShiftStation, shiftsVerifyStationToken } from './shifts-stations'

/** When the QR pass of a shift shows and check-in is open: `checkInOpensMinutes` before it starts until it ends. */
export function shiftsPassWindow(event: H3Event | undefined, shift: { startsAt: Date, endsAt: Date }): { opensAt: Date, closesAt: Date } {
  const { checkInOpensMinutes } = shiftsConfig(event)
  return { opensAt: new Date(shift.startsAt.getTime() - checkInOpensMinutes * 60_000), closesAt: shift.endsAt }
}

/** Whether check-in is open now for a shift. */
export function shiftsCheckInOpen(event: H3Event | undefined, shift: { startsAt: Date, endsAt: Date }, now = new Date()): boolean {
  const { opensAt, closesAt } = shiftsPassWindow(event, shift)
  return now.getTime() >= opensAt.getTime() && now.getTime() <= closesAt.getTime()
}

/**
 * Writes an assignment only while it still has the status the caller read (a conditional update). `undefined` when
 * somebody else changed it first. Fires nothing.
 */
export async function shiftsWriteAssignment(before: ShiftAssignmentRow, patch: Partial<typeof schema.shiftAssignments.$inferInsert>): Promise<ShiftAssignmentRow | undefined> {
  const [row] = await db.update(schema.shiftAssignments).set(patch).where(and(
    eq(schema.shiftAssignments.id, before.id),
    eq(schema.shiftAssignments.status, before.status),
    eq(schema.shiftAssignments.userId, before.userId),
  )).returning()
  return row
}

/** The place of an assignment among a shift's active ones, earliest first (0 is the first place). */
async function shiftsPlaceOf(shiftId: string, assignmentId: string): Promise<number> {
  const rows = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(and(
    eq(schema.shiftAssignments.shiftId, shiftId),
    inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
  )).orderBy(asc(schema.shiftAssignments.createdAt), asc(schema.shiftAssignments.id))
  return rows.findIndex(row => row.id === assignmentId)
}

async function shiftsAssignmentChanged(event: H3Event | undefined, assignment: ShiftAssignmentRow, previous: ShiftAssignmentRow | null, auto?: boolean): Promise<void> {
  await shiftsFire('shifts:assignment:changed', { event, assignment: toShiftAssignmentDto(assignment), previous: previous ? toShiftAssignmentDto(previous) : null, ...(auto ? { auto } : {}) })
}

/**
 * Assigns a person to a shift (staff). The person must be eligible (an explicit role on the shift's team, and the shift
 * role's minimum team role): 409 `not_eligible` otherwise, and 409 `already_assigned` when they hold the shift already.
 * A full shift is a 409 `shift_full` unless `force`. The guards never block: they come back as `warnings`. The capacity
 * and the one-place-per-person rule are checked again after the insert, so two requests at once cannot overfill the
 * shift or assign a person twice: the insert that lost is taken back. Fires `shifts:assignment:changed` with
 * `previous: null`.
 */
export async function shiftsAssign(event: H3Event, entry: ShiftEntry, input: { userId: number, shiftRoleId?: string | null, force?: boolean }, by: number | null, pii: boolean): Promise<ShiftAssignResultDto> {
  const { shift, schedule } = entry
  const roleId = input.shiftRoleId ?? shift.shiftRoleId ?? null
  const role = roleId ? await shiftsRoleOfOr400(schedule.id, shift.teamId, roleId) : null
  const eligibility = await shiftsEligibility(event, input.userId, shift.teamId, role)
  if (!eligibility.eligible) {
    throw apiError(409, 'not_eligible', eligibility.reason === 'role'
      ? 'This person\'s team role is below what the shift role needs.'
      : 'This person holds no role on the shift\'s team (approved crew, or a member added in Teams).', { reason: eligibility.reason })
  }
  if (await shiftsActiveAssignmentOf(shift.id, input.userId)) throw apiError(409, 'already_assigned', 'This person is on the shift already.')
  const capacity = effectiveCapacity(shift, schedule)
  const full = () => apiError(409, 'shift_full', `The shift takes ${capacity} people.`, { capacity })
  if (capacity !== null && !input.force && await shiftsFilledCount(shift.id) >= capacity) throw full()
  const warnings: ShiftWarning[] = await shiftsGuardWarningsFor(event, input.userId, entry)

  const [row] = await db.insert(schema.shiftAssignments).values({
    id: newId('sha'),
    shiftId: shift.id,
    userId: input.userId,
    shiftRoleId: roleId,
    status: 'assigned',
    checkInCode: newCheckInCode(),
    assignedBy: by,
  }).returning()
  const assignment = row!

  // The re-checks after the claim: the earliest active row of the person wins, and the shift must not be over capacity.
  const mine = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(and(
    eq(schema.shiftAssignments.shiftId, shift.id),
    eq(schema.shiftAssignments.userId, input.userId),
    inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
  )).orderBy(asc(schema.shiftAssignments.createdAt), asc(schema.shiftAssignments.id))
  if (mine.length > 1 && mine[0]!.id !== assignment.id) {
    await db.delete(schema.shiftAssignments).where(eq(schema.shiftAssignments.id, assignment.id))
    throw apiError(409, 'already_assigned', 'This person is on the shift already.')
  }
  const filled = await shiftsFilledCount(shift.id)
  // The last places go to the earliest rows (the order of the duplicate check): only a row past the capacity is taken back.
  if (capacity !== null && !input.force && filled > capacity && await shiftsPlaceOf(shift.id, assignment.id) >= capacity) {
    await db.delete(schema.shiftAssignments).where(eq(schema.shiftAssignments.id, assignment.id))
    throw full()
  }
  warnings.push(...shiftCapacityWarnings(filled, capacity, schedule.minPerShift))

  await shiftsAssignmentChanged(event, assignment, null)
  const [dto] = await shiftsAssigneeDtos([assignment], pii)
  return { assignment: dto!, warnings }
}

/**
 * Cancels an assignment (staff, or a person leaving the team). `assigned` and `no_show` can be cancelled; an attended
 * shift cannot (409 `invalid_transition`); a cancelled one is a no-op. Its live swap is cancelled, and offers that gave
 * it back are withdrawn. Fires `shifts:assignment:changed`.
 */
export async function shiftsCancelAssignment(event: H3Event, entry: ShiftAssignmentEntry): Promise<ShiftAssignmentRow> {
  const { assignment } = entry
  if (assignment.status === 'cancelled') return assignment
  if (!canMoveAssignment(assignment.status as ShiftAssignmentStatus, 'cancelled')) {
    throw apiError(409, 'invalid_transition', `An ${assignment.status} assignment cannot be cancelled.`)
  }
  const written = await shiftsWriteAssignment(assignment, { status: 'cancelled' })
  if (!written) {
    const current = await findShiftAssignmentEntry(assignment.id)
    if (current?.assignment.status === 'cancelled') return current.assignment
    throw conflict('The assignment changed meanwhile. Try again.')
  }
  await shiftsCancelSwapsOf(event, written.id)
  await shiftsAssignmentChanged(event, written, assignment)
  return written
}

/**
 * Marks attendance (a lead of the team, or staff; `by: null` with `auto: true` is the system, the auto no-show of the
 * `shifts:close-shifts` task, with no request): `attended` (the check-in time is kept, or set now) or `no_show`.
 * Asking for the status it has is a no-op; a move the status table does not allow is a 409 `invalid_transition`.
 * Marking an ended shift attended gives out its perks at once; a flip from `attended` to `no_show` revokes the earned
 * perks nobody claimed yet. Fires `shifts:attendance:marked` and `shifts:assignment:changed` when it changed (with `auto`).
 */
export async function shiftsMarkAttendance(event: H3Event | undefined, entry: ShiftAssignmentEntry, to: 'attended' | 'no_show', by: number | null, options: { auto?: boolean, now?: Date } = {}): Promise<ShiftAssignmentRow> {
  const { assignment } = entry
  const now = options.now ?? new Date()
  const from = assignment.status as ShiftAssignmentStatus
  if (from === to) return assignment
  if (!canMoveAssignment(from, to)) throw apiError(409, 'invalid_transition', `An ${from} assignment cannot be marked ${to === 'no_show' ? 'a no-show' : to}.`)
  const { opensAt } = shiftsPassWindow(event, entry.shift)
  if (now.getTime() < opensAt.getTime()) {
    throw apiError(409, 'outside_window', 'Attendance can be marked once check-in for the shift opens.', { opensAt: opensAt.toISOString() })
  }
  const checksIn = to === 'attended' && !assignment.checkedInAt
  const patch: Partial<typeof schema.shiftAssignments.$inferInsert> = { status: to }
  if (checksIn) Object.assign(patch, { checkedInAt: now, checkedInBy: by, checkInMethod: 'lead' })
  const written = await shiftsWriteAssignment(assignment, patch)
  if (!written) throw conflict('The assignment changed meanwhile. Try again.')
  if (from === 'assigned') await shiftsCancelSwapsOf(event, written.id)
  if (to === 'no_show' && from === 'attended') await shiftsRevokeEarnedPerks(event, written.id)
  if (to === 'attended') await shiftsEarnPerks(event, [{ assignment: written, shift: entry.shift, schedule: entry.schedule }], now)
  await shiftsFire('shifts:attendance:marked', { event, assignment: toShiftAssignmentDto(written), by, ...(options.auto ? { auto: true } : {}), ...(checksIn ? { method: 'lead' as const } : {}) })
  await shiftsAssignmentChanged(event, written, assignment, options.auto)
  return written
}

/**
 * Claims the check-in of an assignment: `attended`, checked in at `now` by `by` with `method` (a conditional write from
 * `assigned` or `no_show` without a check-in, so two check-ins at once land once). `undefined` when it was claimed
 * meanwhile. Cancels the live swap of an `assigned` one and fires `shifts:attendance:marked` and
 * `shifts:assignment:changed`.
 */
async function shiftsClaimCheckIn(event: H3Event | undefined, assignment: ShiftAssignmentRow, by: number, method: ShiftCheckInMethod, now: Date): Promise<ShiftAssignmentRow | undefined> {
  const [claimed] = await db.update(schema.shiftAssignments).set({ status: 'attended', checkedInAt: now, checkedInBy: by, checkInMethod: method }).where(and(
    eq(schema.shiftAssignments.id, assignment.id),
    eq(schema.shiftAssignments.userId, assignment.userId),
    isNull(schema.shiftAssignments.checkedInAt),
    inArray(schema.shiftAssignments.status, ['assigned', 'no_show']),
  )).returning()
  if (!claimed) return undefined
  if (assignment.status === 'assigned') await shiftsCancelSwapsOf(event, claimed.id)
  await shiftsFire('shifts:attendance:marked', { event, assignment: toShiftAssignmentDto(claimed), by, method })
  await shiftsAssignmentChanged(event, claimed, assignment)
  return claimed
}

/**
 * The `daily` mode: when this is the person's first check-in of the day (in the module's time zone), their other shifts
 * starting that day whose check-in window is open now, whose team's rule has `daily` and that they still hold
 * (`assigned`, no check-in) are checked in too, with `method: 'daily'`. Shifts whose window opens later need a check-in
 * of their own. Returns the assignment ids it checked in.
 */
export async function shiftsDailyCascade(event: H3Event | undefined, first: ShiftAssignmentRow, by: number, now: Date): Promise<string[]> {
  const { timeZone } = shiftsConfig(event)
  const day = dayKey(now, timeZone)
  const dayStart = zonedTimeToUtc(day, '00:00', timeZone)
  const dayEnd = zonedTimeToUtc(addDays(day, 1), '00:00', timeZone)
  const [earlier] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(and(
    eq(schema.shiftAssignments.userId, first.userId),
    ne(schema.shiftAssignments.id, first.id),
    gte(schema.shiftAssignments.checkedInAt, dayStart),
    lt(schema.shiftAssignments.checkedInAt, now),
  )).limit(1)
  if (earlier) return []
  const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts, schedule: schema.shiftSchedules }).from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftAssignments.userId, first.userId),
      ne(schema.shiftAssignments.id, first.id),
      eq(schema.shiftAssignments.status, 'assigned'),
      isNull(schema.shiftAssignments.checkedInAt),
      eq(schema.shiftSchedules.status, 'published'),
      gte(schema.shifts.startsAt, dayStart),
      lt(schema.shifts.startsAt, dayEnd),
    ))
    .orderBy(asc(schema.shifts.startsAt))
    .limit(24)
  const done: string[] = []
  for (const { assignment, shift, schedule } of rows) {
    if (!checkInRuleFor(schedule.checkIn, shift.teamId).modes.includes('daily')) continue
    if (!shiftsCheckInOpen(event, shift, now)) continue
    if (!await shiftsStillEligible(event, assignment, shift.teamId)) continue
    if (await shiftsClaimCheckIn(event, assignment, by, 'daily', now)) done.push(assignment.id)
  }
  return done
}

/** The assignment (with its shift and schedule) a QR pass code belongs to, if any. */
export async function shiftsAssignmentByCode(code: string): Promise<ShiftAssignmentEntry | undefined> {
  const [found] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(eq(schema.shiftAssignments.checkInCode, code)).limit(1)
  return found ? findShiftAssignmentEntry(found.id) : undefined
}

/**
 * Checks a person in with the code of their QR pass, for a team (a lead of it, or staff). An unknown code, or a code of
 * another team's shift, is a 404 (a lead learns nothing about other teams). A cancelled assignment is a 409
 * `assignment_cancelled`; outside the check-in window a 409 `outside_window`. Scanning twice is fine: the second scan
 * reports `alreadyCheckedIn` with the first scan's time. Fires `shifts:attendance:marked` once.
 */
export async function shiftsCheckIn(event: H3Event, teamId: string, code: string, by: number, pii: boolean): Promise<ShiftCheckInDto> {
  const entry = await shiftsAssignmentByCode(code)
  if (!entry || entry.shift.teamId !== teamId) throw notFound('Unknown check-in code.')
  const { assignment, shift, schedule } = entry
  if (assignment.status === 'cancelled') throw apiError(409, 'assignment_cancelled', 'This assignment was cancelled.')
  // The person must still hold their role on the team: one who left (or whose membership stopped granting) cannot check in.
  if (!await shiftsStillEligible(event, assignment, shift.teamId)) {
    await shiftsCancelFutureAssignments(event, assignment.userId, shift.teamId, row => shiftsStillEligible(event, row, shift.teamId))
    throw apiError(409, 'not_eligible', 'This person no longer holds a role on the team.')
  }
  const respond = async (row: ShiftAssignmentRow, alreadyCheckedIn: boolean, alsoCheckedIn: string[] = []): Promise<ShiftCheckInDto> => {
    const [dto] = await shiftsAssigneeDtos([row], pii)
    return { ok: true, alreadyCheckedIn, checkedInAt: (row.checkedInAt ?? new Date()).toISOString(), assignment: dto!, shift: toShiftDto(shift, schedule), alsoCheckedIn }
  }
  if (assignment.status === 'attended' && assignment.checkedInAt) return respond(assignment, true)
  if (!shiftsCheckInOpen(event, shift)) {
    const { opensAt, closesAt } = shiftsPassWindow(event, shift)
    throw apiError(409, 'outside_window', 'Check-in for this shift is not open now.', { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() })
  }
  const now = new Date()
  const claimed = await shiftsClaimCheckIn(event, assignment, by, 'lead', now)
  if (!claimed) {
    const current = await findShiftAssignmentEntry(assignment.id)
    if (current?.assignment.status === 'attended') return respond(current.assignment, true)
    throw conflict('The assignment changed meanwhile. Try again.')
  }
  return respond(claimed, false, await shiftsDailyCascade(event, claimed, by, now))
}

/**
 * A volunteer checks in on one of their own shifts (`POST /api/shifts/me/:assignmentId/check-in`), by a mode the
 * team's rule has on (409 `mode_disabled` otherwise):
 * - `station`: the token of a station's QR code. A token that is not one, or whose signature does not verify, is a 400
 *   `invalid_token`; one older than the previous 30 second window a 409 `token_expired`; a station of another team or
 *   schedule a 409 `wrong_station`.
 * - `location`: the device's position and accuracy. Without a place set, 409 `no_location`; an accuracy worse than the
 *   radius 409 `inaccurate_position`; outside the place 409 `outside_location` (with the distance and radius).
 * Then, like a lead's scan: a cancelled assignment is a 409 `assignment_cancelled`, somebody who lost their role 409
 * `not_eligible`, outside the check-in window 409 `outside_window`. A second check-in (a replayed token, a second tap)
 * answers `alreadyCheckedIn` and changes nothing. The first check-in of the day runs the `daily` mode.
 */
export async function shiftsSelfCheckIn(event: H3Event, entry: ShiftAssignmentEntry, input: ShiftSelfCheckInInput, now = new Date()): Promise<ShiftSelfCheckInDto> {
  const { assignment, shift, schedule } = entry
  const rule = checkInRuleFor(schedule.checkIn, shift.teamId)
  if (!rule.modes.includes(input.mode)) throw apiError(409, 'mode_disabled', `Checking in by ${input.mode} is not on for this shift.`, { modes: rule.modes })
  if (input.mode === 'station') {
    const stationId = await shiftsVerifyStationToken(event, input.token, now.getTime())
    const station = await findShiftStation(stationId)
    if (!station || station.scheduleId !== schedule.id || station.teamId !== shift.teamId) throw apiError(409, 'wrong_station', 'This station is not one of your team\'s on this schedule.')
  }
  else {
    if (!rule.location) throw apiError(409, 'no_location', 'No check-in place is set for this shift.')
    const check = checkLocation(rule.location, { lat: input.latitude, lng: input.longitude }, input.accuracy)
    if (!check.ok) {
      throw check.reason === 'inaccurate'
        ? apiError(409, 'inaccurate_position', 'Your position is not accurate enough. Try again outside, or ask a lead.', { radius: check.radius })
        : apiError(409, 'outside_location', 'You are not at the check-in place.', { distance: check.distance, radius: check.radius })
    }
  }
  if (assignment.status === 'cancelled') throw apiError(409, 'assignment_cancelled', 'This assignment was cancelled.')
  const respond = (row: ShiftAssignmentRow, alreadyCheckedIn: boolean, alsoCheckedIn: string[] = []): ShiftSelfCheckInDto => ({
    ok: true,
    alreadyCheckedIn,
    checkedInAt: (row.checkedInAt ?? now).toISOString(),
    method: (row.checkInMethod ?? input.mode) as ShiftCheckInMethod,
    assignment: toShiftAssignmentDto(row),
    alsoCheckedIn,
  })
  if (assignment.status === 'attended' && assignment.checkedInAt) return respond(assignment, true)
  if (!await shiftsStillEligible(event, assignment, shift.teamId)) throw apiError(409, 'not_eligible', 'You no longer hold a role on the team.')
  if (!shiftsCheckInOpen(event, shift, now)) {
    const { opensAt, closesAt } = shiftsPassWindow(event, shift)
    throw apiError(409, 'outside_window', 'Check-in for this shift is not open now.', { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() })
  }
  const claimed = await shiftsClaimCheckIn(event, assignment, assignment.userId, input.mode, now)
  if (!claimed) {
    const current = await findShiftAssignmentEntry(assignment.id)
    if (current?.assignment.status === 'attended' && current.assignment.userId === assignment.userId) return respond(current.assignment, true)
    throw conflict('The assignment changed meanwhile. Try again.')
  }
  return respond(claimed, false, await shiftsDailyCascade(event, claimed, assignment.userId, now))
}

/**
 * Cancels a person's future `assigned` assignments on a team (they left it, or their role no longer meets the shift
 * role: `keep` decides per assignment). Each one fires `shifts:assignment:changed` and cancels its swap.
 */
export async function shiftsCancelFutureAssignments(event: H3Event, userId: number, teamId: string, keep?: (row: ShiftAssignmentRow) => Promise<boolean> | boolean): Promise<number> {
  const rows = await db.select({ assignment: schema.shiftAssignments }).from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .where(and(
      eq(schema.shiftAssignments.userId, userId),
      eq(schema.shifts.teamId, teamId),
      eq(schema.shiftAssignments.status, 'assigned'),
      gt(schema.shifts.startsAt, new Date()),
    ))
  let cancelled = 0
  for (const { assignment } of rows) {
    if (keep && await keep(assignment)) continue
    const entry = await findShiftAssignmentEntry(assignment.id)
    if (!entry || entry.assignment.status !== 'assigned') continue
    await shiftsCancelAssignment(event, entry).then(() => cancelled++).catch((error: unknown) => {
      console.error(`[shifts] assignment ${assignment.id} could not be cancelled`, error)
    })
  }
  return cancelled
}

/** Whether a person still meets the shift role of an assignment with the team role they hold now. */
export async function shiftsStillEligible(event: H3Event | undefined, assignment: ShiftAssignmentRow, teamId: string): Promise<boolean> {
  const role = await shiftsRoleById(assignment.shiftRoleId)
  return (await shiftsEligibility(event, assignment.userId, teamId, role)).eligible
}
