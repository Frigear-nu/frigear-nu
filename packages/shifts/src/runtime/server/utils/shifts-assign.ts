import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'
import { apiError, conflict, notFound } from '@frigear-nu/module-kit/server'
import type { ShiftAssignResultDto, ShiftAssignmentStatus, ShiftCheckInDto, ShiftWarning } from '../../../types'
import { newCheckInCode, newId } from '../../utils'
import { effectiveCapacity, shiftCapacityWarnings } from '../../utils/guards'
import { ACTIVE_ASSIGNMENT_STATUSES, canMoveAssignment } from '../../utils/status'
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

/** When the QR pass of a shift shows and check-in is open: `checkInOpensMinutes` before it starts until it ends. */
export function shiftsPassWindow(event: H3Event, shift: { startsAt: Date, endsAt: Date }): { opensAt: Date, closesAt: Date } {
  const { checkInOpensMinutes } = shiftsConfig(event)
  return { opensAt: new Date(shift.startsAt.getTime() - checkInOpensMinutes * 60_000), closesAt: shift.endsAt }
}

/** Whether check-in is open now for a shift. */
export function shiftsCheckInOpen(event: H3Event, shift: { startsAt: Date, endsAt: Date }, now = new Date()): boolean {
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

async function shiftsAssignmentChanged(event: H3Event, assignment: ShiftAssignmentRow, previous: ShiftAssignmentRow | null): Promise<void> {
  await shiftsFire('shifts:assignment:changed', { event, assignment: toShiftAssignmentDto(assignment), previous: previous ? toShiftAssignmentDto(previous) : null })
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
 * Marks attendance (a lead of the team, or staff): `attended` (the check-in time is kept, or set now) or `no_show`.
 * Asking for the status it has is a no-op; a move the status table does not allow is a 409 `invalid_transition`. Fires
 * `shifts:attendance:marked` and `shifts:assignment:changed` when it changed.
 */
export async function shiftsMarkAttendance(event: H3Event, entry: ShiftAssignmentEntry, to: 'attended' | 'no_show', by: number): Promise<ShiftAssignmentRow> {
  const { assignment } = entry
  const from = assignment.status as ShiftAssignmentStatus
  if (from === to) return assignment
  if (!canMoveAssignment(from, to)) throw apiError(409, 'invalid_transition', `An ${from} assignment cannot be marked ${to === 'no_show' ? 'a no-show' : to}.`)
  if (Date.now() < shiftsPassWindow(event, entry.shift).opensAt.getTime()) {
    throw apiError(409, 'outside_window', 'Attendance can be marked once check-in for the shift opens.', { opensAt: shiftsPassWindow(event, entry.shift).opensAt.toISOString() })
  }
  const patch: Partial<typeof schema.shiftAssignments.$inferInsert> = { status: to }
  if (to === 'attended' && !assignment.checkedInAt) Object.assign(patch, { checkedInAt: new Date(), checkedInBy: by })
  const written = await shiftsWriteAssignment(assignment, patch)
  if (!written) throw conflict('The assignment changed meanwhile. Try again.')
  if (from === 'assigned') await shiftsCancelSwapsOf(event, written.id)
  await shiftsFire('shifts:attendance:marked', { event, assignment: toShiftAssignmentDto(written), by })
  await shiftsAssignmentChanged(event, written, assignment)
  return written
}

/**
 * Checks a person in with the code of their QR pass, for a team (a lead of it, or staff). An unknown code, or a code of
 * another team's shift, is a 404 (a lead learns nothing about other teams). A cancelled assignment is a 409
 * `assignment_cancelled`; outside the check-in window a 409 `outside_window`. Scanning twice is fine: the second scan
 * reports `alreadyCheckedIn` with the first scan's time. Fires `shifts:attendance:marked` once.
 */
export async function shiftsCheckIn(event: H3Event, teamId: string, code: string, by: number, pii: boolean): Promise<ShiftCheckInDto> {
  const [found] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(eq(schema.shiftAssignments.checkInCode, code)).limit(1)
  const entry = found ? await findShiftAssignmentEntry(found.id) : undefined
  if (!entry || entry.shift.teamId !== teamId) throw notFound('Unknown check-in code.')
  const { assignment, shift, schedule } = entry
  if (assignment.status === 'cancelled') throw apiError(409, 'assignment_cancelled', 'This assignment was cancelled.')
  // The person must still hold their role on the team: one who left (or whose membership stopped granting) cannot check in.
  if (!await shiftsStillEligible(event, assignment, shift.teamId)) {
    await shiftsCancelFutureAssignments(event, assignment.userId, shift.teamId, row => shiftsStillEligible(event, row, shift.teamId))
    throw apiError(409, 'not_eligible', 'This person no longer holds a role on the team.')
  }
  const respond = async (row: ShiftAssignmentRow, alreadyCheckedIn: boolean): Promise<ShiftCheckInDto> => {
    const [dto] = await shiftsAssigneeDtos([row], pii)
    return { ok: true, alreadyCheckedIn, checkedInAt: (row.checkedInAt ?? new Date()).toISOString(), assignment: dto!, shift: toShiftDto(shift, schedule) }
  }
  if (assignment.status === 'attended' && assignment.checkedInAt) return respond(assignment, true)
  if (!shiftsCheckInOpen(event, shift)) {
    const { opensAt, closesAt } = shiftsPassWindow(event, shift)
    throw apiError(409, 'outside_window', 'Check-in for this shift is not open now.', { opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() })
  }
  const [claimed] = await db.update(schema.shiftAssignments).set({ status: 'attended', checkedInAt: new Date(), checkedInBy: by }).where(and(
    eq(schema.shiftAssignments.id, assignment.id),
    isNull(schema.shiftAssignments.checkedInAt),
    inArray(schema.shiftAssignments.status, ['assigned', 'no_show']),
  )).returning()
  if (!claimed) {
    const current = await findShiftAssignmentEntry(assignment.id)
    if (current?.assignment.status === 'attended') return respond(current.assignment, true)
    throw conflict('The assignment changed meanwhile. Try again.')
  }
  if (assignment.status === 'assigned') await shiftsCancelSwapsOf(event, claimed.id)
  await shiftsFire('shifts:attendance:marked', { event, assignment: toShiftAssignmentDto(claimed), by })
  await shiftsAssignmentChanged(event, claimed, assignment)
  return respond(claimed, false)
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
export async function shiftsStillEligible(event: H3Event, assignment: ShiftAssignmentRow, teamId: string): Promise<boolean> {
  const role = await shiftsRoleById(assignment.shiftRoleId)
  return (await shiftsEligibility(event, assignment.userId, teamId, role)).eligible
}
