import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, ne } from 'drizzle-orm'
import { chunkParams, notFound, validationError } from '@frigear-nu/module-kit/server'
import { ladderKeys, roleAtLeast } from '@frigear-nu/teams/utils'
import type { NitroRuntimeHooks } from 'nitropack'
import type { ShiftAssigneeDto, ShiftsRuntimeConfig, ShiftWarning } from '../../../types'
import { ACTIVE_ASSIGNMENT_STATUSES } from '../../utils/status'
import { shiftGuardWarnings } from '../../utils/guards'
import { resolveShiftsTimeZone } from '../../utils/time'
import { DEFAULT_AUTOMATION_BATCH, normalizeAutomationBatch } from '../../utils/checkin'
import { DEFAULT_REMINDER_BATCH, DEFAULT_REMINDER_OFFSETS, normalizeReminderBatch, normalizeReminderOffsets } from '../../utils/reminders'
import type { GuardShift } from '../../utils/guards'
import { toShiftAssignmentDto, toShiftPersonDto } from './shifts-dto'
import type { ShiftAssignmentRow, ShiftRoleRow, ShiftRow, ShiftScheduleRow, ShiftUserLite } from './shifts-dto'

export type ShiftTeamRow = typeof schema.teams.$inferSelect
/** A shift with its schedule. */
export type ShiftEntry = { shift: ShiftRow, schedule: ShiftScheduleRow }
/** An assignment with its shift and schedule. */
export type ShiftAssignmentEntry = ShiftEntry & { assignment: ShiftAssignmentRow }

const DEFAULTS: Omit<ShiftsRuntimeConfig, 'timeZone'> = { checkInOpensMinutes: 60, reminders: { offsets: [...DEFAULT_REMINDER_OFFSETS], sms: false, batchSize: DEFAULT_REMINDER_BATCH }, automation: { batchSize: DEFAULT_AUTOMATION_BATCH } }

/** The module options shifts reads at runtime: the time zone (resolved, see `resolveShiftsTimeZone`), when check-in opens and the reminders. */
export function shiftsConfig(event?: H3Event): ShiftsRuntimeConfig {
  const config = (useRuntimeConfig(event).shifts ?? {}) as Partial<ShiftsRuntimeConfig>
  return {
    timeZone: resolveShiftsTimeZone(config.timeZone, useAppConfig(event)),
    checkInOpensMinutes: config.checkInOpensMinutes ?? DEFAULTS.checkInOpensMinutes,
    reminders: { offsets: normalizeReminderOffsets(config.reminders?.offsets), sms: config.reminders?.sms === true, batchSize: normalizeReminderBatch(config.reminders?.batchSize) },
    automation: { batchSize: normalizeAutomationBatch(config.automation?.batchSize) },
  }
}

/** Calls a shifts hook. Listeners run after the change is written. */
export async function shiftsFire<N extends keyof NitroRuntimeHooks>(name: N, ctx: Parameters<NitroRuntimeHooks[N]>[0]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the hook map is typed per name above
  await (useNitroApp().hooks.callHook as any)(name, ctx)
}

// --- Loading ---------------------------------------------------------------------------------

export async function findShiftSchedule(id: string): Promise<ShiftScheduleRow | undefined> {
  const [row] = await db.select().from(schema.shiftSchedules).where(eq(schema.shiftSchedules.id, id)).limit(1)
  return row
}

export async function getShiftScheduleOr404(id: string): Promise<ShiftScheduleRow> {
  const row = await findShiftSchedule(id)
  if (!row) throw notFound('Schedule not found.')
  return row
}

export async function getShiftRoleOr404(id: string): Promise<ShiftRoleRow> {
  const [row] = await db.select().from(schema.shiftRoles).where(eq(schema.shiftRoles.id, id)).limit(1)
  if (!row) throw notFound('Shift role not found.')
  return row
}

export async function findShiftEntry(id: string): Promise<ShiftEntry | undefined> {
  const [row] = await db.select({ shift: schema.shifts, schedule: schema.shiftSchedules }).from(schema.shifts)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(eq(schema.shifts.id, id)).limit(1)
  return row
}

export async function getShiftEntryOr404(id: string): Promise<ShiftEntry> {
  const row = await findShiftEntry(id)
  if (!row) throw notFound('Shift not found.')
  return row
}

export async function findShiftAssignmentEntry(id: string): Promise<ShiftAssignmentEntry | undefined> {
  const [row] = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts, schedule: schema.shiftSchedules })
    .from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(eq(schema.shiftAssignments.id, id)).limit(1)
  return row
}

export async function getShiftAssignmentEntryOr404(id: string): Promise<ShiftAssignmentEntry> {
  const row = await findShiftAssignmentEntry(id)
  if (!row) throw notFound('Assignment not found.')
  return row
}

/** The name, email, avatar and phone number of users, by id (`loadUserRefs` of `@frigear-nu/users`, in chunks). */
export async function shiftsUsersById(ids: number[]): Promise<Map<number, ShiftUserLite>> {
  return loadUserRefs(ids)
}

/** Teams by id. */
export async function shiftsTeamsById(ids: string[]): Promise<Map<string, ShiftTeamRow>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = (await Promise.all(chunkParams(unique).map(part => db.select().from(schema.teams).where(inArray(schema.teams.id, part))))).flat()
  return new Map(rows.map(row => [row.id, row]))
}

/** Shift roles by id (a lookup in chunks). */
export async function shiftsRolesByIds(ids: Array<string | null | undefined>): Promise<Map<string, ShiftRoleRow>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (!unique.length) return new Map()
  const rows = (await Promise.all(chunkParams(unique).map(part => db.select().from(schema.shiftRoles).where(inArray(schema.shiftRoles.id, part))))).flat()
  return new Map(rows.map(row => [row.id, row]))
}

/**
 * The locale people get their shifts messages in, for many `{ userId, teamId }` pairs at once: the user's own language
 * (`users.locale`), else the one stored on their crew row of the team (the language they applied in), else `en`. Keyed
 * `<userId>:<teamId>`. Chunked lookups, so one run costs a few statements.
 */
export async function shiftsLocalesOfMany(pairs: Array<{ userId: number, teamId: string }>): Promise<Map<string, string>> {
  const userIds = [...new Set(pairs.map(pair => pair.userId))]
  const [users, rows] = await Promise.all([
    loadUserRefs(userIds),
    Promise.all(chunkParams(userIds).map(part => db.select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId, locale: schema.teamMembers.locale })
      .from(schema.teamMembers).where(inArray(schema.teamMembers.userId, part)))).then(parts => parts.flat()),
  ])
  const found = new Map(rows.map(row => [`${row.userId}:${row.teamId}`, row.locale]))
  return new Map(pairs.map((pair) => {
    const key = `${pair.userId}:${pair.teamId}`
    return [key, users.get(pair.userId)?.locale || found.get(key) || 'en']
  }))
}

/** The team with this id when the operation owns it, else a 400 on `field`. */
export async function shiftsOperationTeamOr400(operationId: string, teamId: string, field = 'teamId'): Promise<ShiftTeamRow> {
  const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1)
  if (!team || team.ownerType !== 'operation' || team.ownerId !== operationId) {
    throw validationError([{ path: [field], message: 'The team must belong to the schedule\'s operation.' }], 'Unknown team')
  }
  return team
}

/** The shift role with this id when it belongs to the schedule and the team, else a 400. */
export async function shiftsRoleOfOr400(scheduleId: string, teamId: string, roleId: string, field = 'shiftRoleId'): Promise<ShiftRoleRow> {
  const [role] = await db.select().from(schema.shiftRoles).where(eq(schema.shiftRoles.id, roleId)).limit(1)
  if (!role || role.scheduleId !== scheduleId || role.teamId !== teamId) {
    throw validationError([{ path: [field], message: 'The shift role must belong to the schedule and the shift\'s team.' }], 'Unknown shift role')
  }
  return role
}

// --- Eligibility and guards ------------------------------------------------------------------

/** Why a person cannot hold a shift: `grant` (no explicit role on the team) or `role` (below the shift role's team role). */
export type ShiftsIneligibility = 'grant' | 'role'

/**
 * Whether a person may hold an assignment on a team with a shift role: they hold an **explicit** active role on the team
 * (approved crew, or a member staff added in Teams: `teamGrantOf` with `source: 'explicit'`) and, when the shift role
 * sets a `teamRole`, at least that role on the team kind's ladder. People who hold the team role only through a mapping
 * rule are not assignable.
 */
export async function shiftsEligibility(event: H3Event | undefined, userId: number, teamId: string, role: Pick<ShiftRoleRow, 'teamRole'> | null | undefined): Promise<{ eligible: boolean, reason: ShiftsIneligibility | null, role: string | null }> {
  const grant = await teamGrantOf(event, userId, teamId)
  if (!grant || grant.source !== 'explicit') return { eligible: false, reason: 'grant', role: grant?.role ?? null }
  if (role?.teamRole) {
    const ladder = (await loadTeamLadders(event))[grant.kind]
    if (!roleAtLeast(ladderKeys(ladder), grant.role, role.teamRole)) return { eligible: false, reason: 'role', role: grant.role }
  }
  return { eligible: true, reason: null, role: grant.role }
}

/** The shift role of an assignment or shift, or `null`. */
export async function shiftsRoleById(id: string | null | undefined): Promise<ShiftRoleRow | null> {
  if (!id) return null
  const [row] = await db.select().from(schema.shiftRoles).where(eq(schema.shiftRoles.id, id)).limit(1)
  return row ?? null
}

/** The shifts a person holds a place on (`assigned` or `attended`), with the ones in `exclude` (assignment ids) left out. */
export async function shiftsActiveShiftsOf(userId: number, exclude: string[] = []): Promise<GuardShift[]> {
  const rows = await db.select({ id: schema.shifts.id, startsAt: schema.shifts.startsAt, endsAt: schema.shifts.endsAt, assignmentId: schema.shiftAssignments.id })
    .from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .where(and(eq(schema.shiftAssignments.userId, userId), inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES])))
  return rows.filter(row => !exclude.includes(row.assignmentId)).map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt }))
}

/** The guards a person breaks by holding `shift` (on top of their other shifts, `exclude` left out). */
export async function shiftsGuardWarningsFor(event: H3Event, userId: number, entry: ShiftEntry, exclude: string[] = []): Promise<ShiftWarning[]> {
  const others = await shiftsActiveShiftsOf(userId, exclude)
  return shiftGuardWarnings(entry.shift, others, entry.schedule.guards, shiftsConfig(event).timeZone)
}

/** How many people hold a place on a shift (`assigned` and `attended`). */
export async function shiftsFilledCount(shiftId: string, except?: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.shiftAssignments).where(and(
    eq(schema.shiftAssignments.shiftId, shiftId),
    inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
    except ? ne(schema.shiftAssignments.id, except) : undefined,
  ))
  return Number(row?.total ?? 0)
}

/** The person's active assignment on a shift, if any. */
export async function shiftsActiveAssignmentOf(shiftId: string, userId: number): Promise<ShiftAssignmentRow | undefined> {
  const [row] = await db.select().from(schema.shiftAssignments).where(and(
    eq(schema.shiftAssignments.shiftId, shiftId),
    eq(schema.shiftAssignments.userId, userId),
    inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
  )).limit(1)
  return row
}

/** Assignments with their people; contact details only with `pii`. */
export async function shiftsAssigneeDtos(rows: ShiftAssignmentRow[], pii: boolean): Promise<ShiftAssigneeDto[]> {
  const users = await shiftsUsersById(rows.map(row => row.userId))
  return rows.map(row => ({ ...toShiftAssignmentDto(row), person: toShiftPersonDto(row.userId, users.get(row.userId), pii) }))
}

/** Whether a shift has not started yet. */
export const shiftsIsFuture = (shift: Pick<ShiftRow, 'startsAt'>, now = new Date()) => shift.startsAt.getTime() > now.getTime()

/**
 * The locale a person gets their shifts emails in: their own language (`users.locale`), else the one stored on their crew
 * row of the team, else `en`.
 */
export async function shiftsLocaleOf(userId: number, teamId: string): Promise<string> {
  return (await shiftsLocalesOfMany([{ userId, teamId }])).get(`${userId}:${teamId}`) ?? 'en'
}
