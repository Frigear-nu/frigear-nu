import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, desc, eq, gte, inArray, lt, ne } from 'drizzle-orm'
import type { z } from 'zod'
import { apiError, validationError } from '@frigear-nu/module-kit/server'
import type { ShiftCopyResultDto, ShiftDto, ShiftScheduleDto, ShiftWithAssigneesDto, Translated } from '../../../types'
import { newId } from '../../utils'
import { ACTIVE_ASSIGNMENT_STATUSES } from '../../utils/status'
import { shiftByDays, slotInstants } from '../../utils/time'
import { toShiftDto, toShiftRoleDto, toShiftScheduleDto } from './shifts-dto'
import type { ShiftRoleRow, ShiftRow, ShiftScheduleRow } from './shifts-dto'
import { getShiftScheduleOr404, shiftsAssigneeDtos, shiftsConfig, shiftsFire, shiftsOperationTeamOr400, shiftsRoleOfOr400, shiftsTeamsById } from './shifts-core'
import type { ShiftEntry } from './shifts-core'
import type { shiftsBulkInput, shiftsRoleInput, shiftsRolePatch, shiftsScheduleInput, shiftsSchedulePatch, shiftsShiftPatch } from './shifts-schemas'

type ScheduleInput = z.output<typeof shiftsScheduleInput>
type SchedulePatch = z.output<typeof shiftsSchedulePatch>
type RoleInput = z.output<typeof shiftsRoleInput>
type RolePatch = z.output<typeof shiftsRolePatch>
type BulkInput = z.output<typeof shiftsBulkInput>
type ShiftPatch = z.output<typeof shiftsShiftPatch>

const cleanGuards = (guards: { maxShiftsPerDay?: number | null, minRestHours?: number | null } | null | undefined) => ({
  ...(guards?.maxShiftsPerDay ? { maxShiftsPerDay: guards.maxShiftsPerDay } : {}),
  ...(guards?.minRestHours ? { minRestHours: guards.minRestHours } : {}),
})

// --- Schedules -------------------------------------------------------------------------------

/** The schedules of an operation (or every one), newest first, with how many shifts each has. */
export async function shiftsListSchedules(operationId?: string): Promise<ShiftScheduleDto[]> {
  const rows = await db.select().from(schema.shiftSchedules)
    .where(operationId ? eq(schema.shiftSchedules.operationId, operationId) : undefined)
    .orderBy(desc(schema.shiftSchedules.createdAt), asc(schema.shiftSchedules.id))
    .limit(500)
  if (!rows.length) return []
  const counts = await db.select({ scheduleId: schema.shifts.scheduleId, total: count() }).from(schema.shifts)
    .where(inArray(schema.shifts.scheduleId, rows.map(row => row.id))).groupBy(schema.shifts.scheduleId)
  const byId = new Map(counts.map(row => [row.scheduleId, Number(row.total)]))
  return rows.map(row => toShiftScheduleDto(row, byId.get(row.id) ?? 0))
}

/** Creates a draft schedule. */
export async function shiftsCreateSchedule(input: ScheduleInput): Promise<ShiftScheduleRow> {
  const [row] = await db.insert(schema.shiftSchedules).values({
    id: newId('shs'),
    operationId: input.operationId,
    name: input.name,
    status: 'draft',
    swapMode: input.swapMode,
    minPerShift: input.minPerShift ?? null,
    maxPerShift: input.maxPerShift ?? null,
    guards: cleanGuards(input.guards),
  }).returning()
  return row!
}

/** Changes a schedule's name, swap mode, sizes or guards (not its status: see publish). */
export async function shiftsPatchSchedule(existing: ShiftScheduleRow, patch: SchedulePatch): Promise<ShiftScheduleRow> {
  const values: Partial<typeof schema.shiftSchedules.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.swapMode !== undefined) values.swapMode = patch.swapMode
  if (patch.minPerShift !== undefined) values.minPerShift = patch.minPerShift
  if (patch.maxPerShift !== undefined) values.maxPerShift = patch.maxPerShift
  if (patch.guards !== undefined) values.guards = cleanGuards(patch.guards)
  const min = values.minPerShift !== undefined ? values.minPerShift : existing.minPerShift
  const max = values.maxPerShift !== undefined ? values.maxPerShift : existing.maxPerShift
  if (min != null && max != null && max < min) throw validationError([{ path: ['maxPerShift'], message: 'The maximum must be at least the minimum.' }])
  if (!Object.keys(values).length) return existing
  const [row] = await db.update(schema.shiftSchedules).set(values).where(eq(schema.shiftSchedules.id, existing.id)).returning()
  return row!
}

/**
 * Publishes a draft schedule (a conditional write: publishing twice at once publishes once) and fires
 * `shifts:schedule:published`. Publishing a published schedule is a no-op.
 */
export async function shiftsPublishSchedule(event: H3Event, existing: ShiftScheduleRow): Promise<ShiftScheduleRow> {
  if (existing.status === 'published') return existing
  const [row] = await db.update(schema.shiftSchedules).set({ status: 'published', publishedAt: new Date() })
    .where(and(eq(schema.shiftSchedules.id, existing.id), eq(schema.shiftSchedules.status, 'draft'))).returning()
  if (!row) return getShiftScheduleOr404(existing.id)
  await shiftsFire('shifts:schedule:published', { event, schedule: toShiftScheduleDto(row) })
  return row
}

/** Whether any of the shifts holds a person (`assigned`, `attended` or `no_show`): history staff must not lose. */
async function shiftsHaveAttendance(shiftIds: string[]): Promise<boolean> {
  if (!shiftIds.length) return false
  const [row] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments)
    .where(and(inArray(schema.shiftAssignments.shiftId, shiftIds), ne(schema.shiftAssignments.status, 'cancelled'))).limit(1)
  return !!row
}

/** Removes shifts and everything hanging off them (cancelled assignments, their swaps and offers). */
async function shiftsDeleteShiftRows(shiftIds: string[]): Promise<void> {
  if (!shiftIds.length) return
  const assignments = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments).where(inArray(schema.shiftAssignments.shiftId, shiftIds))
  const assignmentIds = assignments.map(row => row.id)
  if (assignmentIds.length) {
    const swaps = await db.select({ id: schema.shiftSwaps.id }).from(schema.shiftSwaps).where(inArray(schema.shiftSwaps.assignmentId, assignmentIds))
    if (swaps.length) {
      await db.delete(schema.shiftSwapOffers).where(inArray(schema.shiftSwapOffers.swapId, swaps.map(row => row.id)))
      await db.delete(schema.shiftSwaps).where(inArray(schema.shiftSwaps.id, swaps.map(row => row.id)))
    }
    await db.delete(schema.shiftReminders).where(inArray(schema.shiftReminders.assignmentId, assignmentIds))
    await db.delete(schema.shiftPerkRedemptions).where(inArray(schema.shiftPerkRedemptions.assignmentId, assignmentIds))
    await db.delete(schema.shiftAssignments).where(inArray(schema.shiftAssignments.id, assignmentIds))
  }
  await db.delete(schema.shifts).where(inArray(schema.shifts.id, shiftIds))
}

/** Deletes a schedule with its roles and shifts. 409 `schedule_in_use` while people are (or were) on its shifts. */
export async function shiftsDeleteSchedule(existing: ShiftScheduleRow): Promise<void> {
  const shiftIds = (await db.select({ id: schema.shifts.id }).from(schema.shifts).where(eq(schema.shifts.scheduleId, existing.id))).map(row => row.id)
  if (await shiftsHaveAttendance(shiftIds)) throw apiError(409, 'schedule_in_use', 'People are assigned to shifts of this schedule. Cancel their assignments first.')
  await shiftsDeleteShiftRows(shiftIds)
  await db.delete(schema.shiftRoles).where(eq(schema.shiftRoles.scheduleId, existing.id))
  await db.delete(schema.shiftSchedules).where(eq(schema.shiftSchedules.id, existing.id))
}

// --- Roles -----------------------------------------------------------------------------------

export async function shiftsListRoles(scheduleId: string) {
  const rows = await db.select().from(schema.shiftRoles).where(eq(schema.shiftRoles.scheduleId, scheduleId)).orderBy(asc(schema.shiftRoles.createdAt), asc(schema.shiftRoles.id))
  return rows.map(toShiftRoleDto)
}

/** Creates a shift role on a team of the schedule's operation; `teamRole` must be on the team kind's ladder. */
export async function shiftsCreateRole(event: H3Event, schedule: ShiftScheduleRow, input: RoleInput): Promise<ShiftRoleRow> {
  const team = await shiftsOperationTeamOr400(schedule.operationId, input.teamId)
  if (input.teamRole) await assertTeamRoleOnLadder(event, team.kind, input.teamRole, 'teamRole')
  const [row] = await db.insert(schema.shiftRoles).values({ id: newId('shr'), scheduleId: schedule.id, teamId: team.id, teamRole: input.teamRole ?? null, name: input.name }).returning()
  return row!
}

export async function shiftsPatchRole(event: H3Event, role: ShiftRoleRow, patch: RolePatch): Promise<ShiftRoleRow> {
  const values: Partial<typeof schema.shiftRoles.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.teamRole !== undefined) {
    if (patch.teamRole) {
      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, role.teamId)).limit(1)
      if (team) await assertTeamRoleOnLadder(event, team.kind, patch.teamRole, 'teamRole')
    }
    values.teamRole = patch.teamRole ?? null
  }
  if (!Object.keys(values).length) return role
  const [row] = await db.update(schema.shiftRoles).set(values).where(eq(schema.shiftRoles.id, role.id)).returning()
  return row!
}

/** Deletes a shift role. 409 `role_in_use` while a shift or an active assignment uses it. */
export async function shiftsDeleteRole(role: ShiftRoleRow): Promise<void> {
  const [shift] = await db.select({ id: schema.shifts.id }).from(schema.shifts).where(eq(schema.shifts.shiftRoleId, role.id)).limit(1)
  const [assignment] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments)
    .where(and(eq(schema.shiftAssignments.shiftRoleId, role.id), ne(schema.shiftAssignments.status, 'cancelled'))).limit(1)
  if (shift || assignment) throw apiError(409, 'role_in_use', 'Shifts or assignments use this role. Change them first.')
  await db.delete(schema.shiftRoles).where(eq(schema.shiftRoles.id, role.id))
}

// --- Shifts ----------------------------------------------------------------------------------

/**
 * Creates every slot on every day as a shift of one team. Days and `HH:mm` slots are wall-clock times in the module's
 * `timeZone`; a slot that ends at or before it starts ends the next day. Fires `shifts:shift:created` per shift.
 */
export async function shiftsBulkCreate(event: H3Event, schedule: ShiftScheduleRow, input: BulkInput): Promise<ShiftDto[]> {
  const team = await shiftsOperationTeamOr400(schedule.operationId, input.teamId)
  if (input.shiftRoleId) await shiftsRoleOfOr400(schedule.id, team.id, input.shiftRoleId)
  const { timeZone } = shiftsConfig(event)
  const values = input.days.flatMap(day => input.slots.map((slot) => {
    const { startsAt, endsAt } = slotInstants(day, slot, timeZone)
    return {
      id: newId('shf'),
      scheduleId: schedule.id,
      teamId: team.id,
      shiftRoleId: input.shiftRoleId ?? null,
      startsAt,
      endsAt,
      capacity: input.capacity ?? null,
      location: input.location ?? null,
      notes: input.notes && (typeof input.notes !== 'string' || input.notes) ? input.notes : null,
    }
  }))
  const rows: ShiftRow[] = []
  // In chunks, so a big bulk stays under the bound-parameter limit of sqlite and D1.
  for (let index = 0; index < values.length; index += 25) {
    rows.push(...await db.insert(schema.shifts).values(values.slice(index, index + 25)).returning())
  }
  rows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const dtos = rows.map(row => toShiftDto(row, schedule))
  for (const shift of dtos) await shiftsFire('shifts:shift:created', { event, shift })
  return dtos
}

/**
 * Changes a shift and fires `shifts:shift:updated`. Moving it to another team, or changing its role, is refused (409
 * `shift_in_use`) while people hold a place on it: they were checked against the old team.
 */
export async function shiftsPatchShift(event: H3Event, entry: ShiftEntry, patch: ShiftPatch): Promise<ShiftDto> {
  const { shift, schedule } = entry
  const values: Partial<typeof schema.shifts.$inferInsert> = {}
  const teamId = patch.teamId ?? shift.teamId
  if (patch.teamId !== undefined && patch.teamId !== shift.teamId) {
    await shiftsOperationTeamOr400(schedule.operationId, patch.teamId)
    values.teamId = patch.teamId
  }
  if (patch.shiftRoleId !== undefined && patch.shiftRoleId !== shift.shiftRoleId) {
    if (patch.shiftRoleId) await shiftsRoleOfOr400(schedule.id, teamId, patch.shiftRoleId)
    values.shiftRoleId = patch.shiftRoleId ?? null
  }
  else if (values.teamId && shift.shiftRoleId) {
    // A role of the old team does not apply to the new one.
    values.shiftRoleId = null
  }
  if ((values.teamId || values.shiftRoleId !== undefined) && await shiftsHaveActive(shift.id)) {
    throw apiError(409, 'shift_in_use', 'People are assigned to this shift. Cancel their assignments before moving it to another team or role.')
  }
  const startsAt = patch.startsAt ?? shift.startsAt
  const endsAt = patch.endsAt ?? shift.endsAt
  if (endsAt.getTime() <= startsAt.getTime()) throw validationError([{ path: ['endsAt'], message: 'A shift must end after it starts.' }])
  if (patch.startsAt) values.startsAt = patch.startsAt
  if (patch.endsAt) values.endsAt = patch.endsAt
  if (patch.capacity !== undefined) values.capacity = patch.capacity
  if (patch.location !== undefined) values.location = patch.location
  if (patch.notes !== undefined) values.notes = patch.notes && (typeof patch.notes !== 'string' || patch.notes) ? patch.notes : null
  const previous = toShiftDto(shift, schedule)
  if (!Object.keys(values).length) return previous
  const [row] = await db.update(schema.shifts).set(values).where(eq(schema.shifts.id, shift.id)).returning()
  const dto = toShiftDto(row!, schedule)
  await shiftsFire('shifts:shift:updated', { event, shift: dto, previous })
  return dto
}

async function shiftsHaveActive(shiftId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.shiftAssignments.id }).from(schema.shiftAssignments)
    .where(and(eq(schema.shiftAssignments.shiftId, shiftId), inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]))).limit(1)
  return !!row
}

/** Deletes a shift. 409 `shift_in_use` while people are (or were) on it. */
export async function shiftsDeleteShift(entry: ShiftEntry): Promise<void> {
  if (await shiftsHaveAttendance([entry.shift.id])) throw apiError(409, 'shift_in_use', 'People are assigned to this shift. Cancel their assignments first.')
  await shiftsDeleteShiftRows([entry.shift.id])
}

/** The shifts of a schedule (`teamId`, `from`, `to` narrow it) with their assignments; contact details only with `pii`. */
export async function shiftsScheduleShifts(schedule: ShiftScheduleRow, query: { teamId?: string, from?: Date, to?: Date }, pii: boolean): Promise<ShiftWithAssigneesDto[]> {
  const rows = await db.select().from(schema.shifts).where(and(
    eq(schema.shifts.scheduleId, schedule.id),
    query.teamId ? eq(schema.shifts.teamId, query.teamId) : undefined,
    query.from ? gte(schema.shifts.endsAt, query.from) : undefined,
    query.to ? lt(schema.shifts.startsAt, query.to) : undefined,
  )).orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id)).limit(2000)
  return shiftsWithAssignees(rows, new Map([[schedule.id, schedule]]), pii)
}

/** Shifts with their team names and assignments (cancelled ones left out). */
export async function shiftsWithAssignees(rows: ShiftRow[], schedules: Map<string, Pick<ShiftScheduleRow, 'operationId' | 'maxPerShift'>>, pii: boolean): Promise<ShiftWithAssigneesDto[]> {
  if (!rows.length) return []
  const [assignments, teams] = await Promise.all([
    db.select().from(schema.shiftAssignments).where(and(
      inArray(schema.shiftAssignments.shiftId, rows.map(row => row.id)),
      ne(schema.shiftAssignments.status, 'cancelled'),
    )).orderBy(asc(schema.shiftAssignments.createdAt), asc(schema.shiftAssignments.id)),
    shiftsTeamsById(rows.map(row => row.teamId)),
  ])
  const assignees = await shiftsAssigneeDtos(assignments, pii)
  return rows.map((row) => {
    const own = assignees.filter(item => item.shiftId === row.id)
    return {
      ...toShiftDto(row, schedules.get(row.scheduleId)!),
      teamName: (teams.get(row.teamId)?.name ?? row.teamId) as Translated,
      assignees: own,
      filled: own.filter(item => item.status === 'assigned' || item.status === 'attended').length,
    }
  })
}

/**
 * Copies the roles and shifts of another schedule into this one, the shifts moved by `offsetDays` at the same wall-clock
 * time. Assignments are not copied. A source of another operation maps its teams to this operation's teams by name;
 * teams without a match are skipped (`skippedTeamIds`). Fires `shifts:shift:created` per shift.
 */
export async function shiftsCopyFrom(event: H3Event, target: ShiftScheduleRow, sourceId: string, offsetDays: number): Promise<ShiftCopyResultDto> {
  if (sourceId === target.id) throw validationError([{ path: ['scheduleId'], message: 'Pick another schedule to copy from.' }])
  const source = await getShiftScheduleOr404(sourceId).catch(() => {
    throw validationError([{ path: ['scheduleId'], message: 'This schedule does not exist.' }], 'Unknown schedule')
  })
  const [roles, shifts] = await Promise.all([
    db.select().from(schema.shiftRoles).where(eq(schema.shiftRoles.scheduleId, source.id)).orderBy(asc(schema.shiftRoles.createdAt)),
    db.select().from(schema.shifts).where(eq(schema.shifts.scheduleId, source.id)).orderBy(asc(schema.shifts.startsAt)),
  ])

  // Source team -> target team.
  const teamMap = new Map<string, string>()
  const sourceTeamIds = [...new Set([...roles.map(role => role.teamId), ...shifts.map(shift => shift.teamId)])]
  if (source.operationId === target.operationId) {
    for (const id of sourceTeamIds) teamMap.set(id, id)
  }
  else {
    const [sourceTeams, targetTeams] = await Promise.all([
      shiftsTeamsById(sourceTeamIds),
      db.select().from(schema.teams).where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, target.operationId))),
    ])
    const key = (name: unknown) => JSON.stringify(name)
    for (const [id, team] of sourceTeams) {
      const match = targetTeams.find(candidate => key(candidate.name) === key(team.name) && candidate.kind === team.kind)
        ?? targetTeams.find(candidate => key(candidate.name) === key(team.name))
      if (match) teamMap.set(id, match.id)
    }
  }
  const skippedTeamIds = sourceTeamIds.filter(id => !teamMap.has(id))

  const roleMap = new Map<string, string>()
  const changedRoleIds: string[] = []
  const targetTeams = await shiftsTeamsById([...teamMap.values()])
  const ladders = await loadTeamLadders(event)
  for (const role of roles) {
    const teamId = teamMap.get(role.teamId)
    if (!teamId) continue
    // The minimum team role must be on the target team kind's ladder; one that is not is dropped (anybody may hold it).
    let teamRole = role.teamRole
    const keys = ladders[targetTeams.get(teamId)?.kind ?? '']?.roles.map(item => item.key) ?? []
    if (teamRole && !keys.includes(teamRole)) {
      teamRole = null
      changedRoleIds.push(role.id)
    }
    const id = newId('shr')
    roleMap.set(role.id, id)
    await db.insert(schema.shiftRoles).values({ id, scheduleId: target.id, teamId, teamRole, name: role.name })
  }

  const { timeZone } = shiftsConfig(event)
  const values = shifts.flatMap((shift) => {
    const teamId = teamMap.get(shift.teamId)
    if (!teamId) return []
    return [{
      id: newId('shf'),
      scheduleId: target.id,
      teamId,
      shiftRoleId: shift.shiftRoleId ? roleMap.get(shift.shiftRoleId) ?? null : null,
      startsAt: shiftByDays(shift.startsAt, offsetDays, timeZone),
      endsAt: shiftByDays(shift.endsAt, offsetDays, timeZone),
      capacity: shift.capacity,
      location: shift.location,
      notes: shift.notes,
    }]
  })
  const created: ShiftRow[] = []
  for (let index = 0; index < values.length; index += 25) {
    created.push(...await db.insert(schema.shifts).values(values.slice(index, index + 25)).returning())
  }
  for (const row of created) await shiftsFire('shifts:shift:created', { event, shift: toShiftDto(row, target) })
  return { schedule: toShiftScheduleDto(target, undefined), roles: roleMap.size, shifts: created.length, skippedTeamIds, changedRoleIds }
}
