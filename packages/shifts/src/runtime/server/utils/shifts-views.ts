import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, gte, inArray, lt, lte, ne } from 'drizzle-orm'
import { renderSVG } from 'uqr'
import type { MyShiftDetailDto, MyShiftDto, ShiftCandidateDto, ShiftPassDto, ShiftPersonDto, ShiftsLedTeamDto, ShiftsNowDto, ShiftsOperationTeamDto, ShiftSwapKind, ShiftSwapStatus, ShiftWithAssigneesDto, Translated } from '../../../types'
import { scheduleSettingsOf } from '../../utils/settings'
import { ACTIVE_ASSIGNMENT_STATUSES } from '../../utils/status'
import { toShiftAssignmentDto, toShiftDto, toShiftPersonDto } from './shifts-dto'
import type { ShiftRow, ShiftScheduleRow } from './shifts-dto'
import { shiftsActiveAssignmentOf, shiftsEligibility, shiftsGuardWarningsFor, shiftsRoleById, shiftsRoleOfOr400, shiftsTeamsById, shiftsUsersById } from './shifts-core'
import type { ShiftAssignmentEntry } from './shifts-core'
import { shiftsCheckInOpen, shiftsPassWindow } from './shifts-assign'
import { shiftsWithAssignees } from './shifts-admin'
import { findLiveShiftSwapOf, shiftsSwapDtos } from './shifts-swaps'

/**
 * My shifts in published schedules, soonest first (`from`, `to` narrow it to shifts that overlap the range). Cancelled
 * assignments are left out.
 */
export async function shiftsMyShifts(userId: number, range: { from?: Date, to?: Date } = {}): Promise<MyShiftDto[]> {
  const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts, schedule: schema.shiftSchedules })
    .from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftAssignments.userId, userId),
      ne(schema.shiftAssignments.status, 'cancelled'),
      eq(schema.shiftSchedules.status, 'published'),
      range.from ? gt(schema.shifts.endsAt, range.from) : undefined,
      range.to ? lt(schema.shifts.startsAt, range.to) : undefined,
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
    .limit(1000)
  return shiftsMyShiftDtos(rows)
}

/** My shift DTOs of assignment entries: the operation, schedule, team and role names, and my live swap. */
export async function shiftsMyShiftDtos(rows: ShiftAssignmentEntry[]): Promise<MyShiftDto[]> {
  if (!rows.length) return []
  const operationIds = [...new Set(rows.map(row => row.schedule.operationId))]
  const roleIds = [...new Set(rows.flatMap(row => row.assignment.shiftRoleId ? [row.assignment.shiftRoleId] : []))]
  const [operations, roles, teams, swaps] = await Promise.all([
    db.select({ id: schema.operations.id, name: schema.operations.name }).from(schema.operations).where(inArray(schema.operations.id, operationIds)),
    roleIds.length ? db.select().from(schema.shiftRoles).where(inArray(schema.shiftRoles.id, roleIds)) : Promise.resolve([]),
    shiftsTeamsById(rows.map(row => row.shift.teamId)),
    db.select().from(schema.shiftSwaps).where(and(
      inArray(schema.shiftSwaps.assignmentId, rows.map(row => row.assignment.id)),
      inArray(schema.shiftSwaps.status, ['open', 'offered', 'accepted', 'pending_approval']),
    )),
  ])
  return rows.map(({ assignment, shift, schedule }) => {
    const swap = swaps.find(item => item.assignmentId === assignment.id)
    return {
      assignment: toShiftAssignmentDto(assignment),
      shift: toShiftDto(shift, schedule),
      operationId: schedule.operationId,
      operationName: (operations.find(item => item.id === schedule.operationId)?.name ?? schedule.operationId) as Translated,
      scheduleName: schedule.name as Translated,
      teamName: (teams.get(shift.teamId)?.name ?? shift.teamId) as Translated,
      roleName: (roles.find(role => role.id === assignment.shiftRoleId)?.name ?? null) as Translated | null,
      swap: swap ? { id: swap.id, status: swap.status as ShiftSwapStatus, kind: swap.kind as ShiftSwapKind } : null,
      settings: scheduleSettingsOf(schedule),
    }
  })
}

/**
 * The leads (lead role and up) of a team who hold a place on one of its shifts overlapping `[startsAt, endsAt)`, names only.
 * `exclude` leaves a person out (yourself).
 */
export async function shiftsLeadsOnDuty(event: H3Event, teamId: string, startsAt: Date, endsAt: Date, exclude?: number): Promise<ShiftPersonDto[]> {
  const rows = await db.select({ userId: schema.shiftAssignments.userId }).from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shifts.teamId, teamId),
      eq(schema.shiftSchedules.status, 'published'),
      inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
      lt(schema.shifts.startsAt, endsAt),
      gt(schema.shifts.endsAt, startsAt),
    ))
  const ids = [...new Set(rows.map(row => row.userId))].filter(id => id !== exclude)
  const leads: number[] = []
  for (const id of ids) if (await isTeamLead(event, id, teamId)) leads.push(id)
  const users = await shiftsUsersById(leads)
  return leads.map(id => toShiftPersonDto(id, users.get(id), false))
}

/** One of my shifts with the leads on duty, my live swap (with its offers) and the pass window. */
export async function shiftsMyShiftDetail(event: H3Event, entry: ShiftAssignmentEntry): Promise<MyShiftDetailDto> {
  const [base] = await shiftsMyShiftDtos([entry])
  const swap = await findLiveShiftSwapOf(entry.assignment.id)
  const [swapDetail] = swap ? await shiftsSwapDtos([swap], { offers: true }) : []
  const { opensAt, closesAt } = shiftsPassWindow(event, entry.shift)
  return {
    ...base!,
    leadsOnDuty: await shiftsLeadsOnDuty(event, entry.shift.teamId, entry.shift.startsAt, entry.shift.endsAt, entry.assignment.userId),
    swapDetail: swapDetail ?? null,
    passOpensAt: opensAt.toISOString(),
    passClosesAt: closesAt.toISOString(),
  }
}

/**
 * The QR pass of an assignment: the code (and its QR code as SVG) only while check-in is open and the assignment holds a
 * place. The perks are added by the route (`shiftsPassPerks`).
 */
export function shiftsPassOf(event: H3Event, entry: ShiftAssignmentEntry): Omit<ShiftPassDto, 'perks'> {
  const { opensAt, closesAt } = shiftsPassWindow(event, entry.shift)
  const available = (entry.assignment.status === 'assigned' || entry.assignment.status === 'attended') && shiftsCheckInOpen(event, entry.shift)
  return {
    assignmentId: entry.assignment.id,
    available,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    code: available ? entry.assignment.checkInCode : null,
    svg: available ? renderSVG(entry.assignment.checkInCode, { border: 1 }) : null,
  }
}

/** A team's shifts in published schedules (`from`, `to` narrow it), with who works them; contact details only with `pii`. */
export async function shiftsTeamShifts(teamId: string, range: { from?: Date, to?: Date }, pii: boolean): Promise<ShiftWithAssigneesDto[]> {
  const rows = await db.select({ shift: schema.shifts, schedule: schema.shiftSchedules }).from(schema.shifts)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shifts.teamId, teamId),
      eq(schema.shiftSchedules.status, 'published'),
      range.from ? gt(schema.shifts.endsAt, range.from) : undefined,
      range.to ? lt(schema.shifts.startsAt, range.to) : undefined,
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))
    .limit(1000)
  const schedules = new Map<string, ShiftScheduleRow>(rows.map(row => [row.schedule.id, row.schedule]))
  return shiftsWithAssignees(rows.map(row => row.shift), schedules, pii)
}

/**
 * Who is on shift now in an operation: the shifts of its published schedules running at `at`, with the people on them
 * (`assigned` and `attended`) and, per team, the leads among them. Contact details only with `pii`.
 */
export async function shiftsNow(event: H3Event, operationId: string, pii: boolean, at = new Date()): Promise<ShiftsNowDto> {
  const rows = await db.select({ shift: schema.shifts, schedule: schema.shiftSchedules }).from(schema.shifts)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftSchedules.operationId, operationId),
      eq(schema.shiftSchedules.status, 'published'),
      lte(schema.shifts.startsAt, at),
      gte(schema.shifts.endsAt, at),
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))
    .limit(1000)
  const schedules = new Map<string, ShiftScheduleRow>(rows.map(row => [row.schedule.id, row.schedule]))
  const shifts = await shiftsWithAssignees(rows.map(row => row.shift), schedules, pii)
  const teams = await shiftsTeamsById(shifts.map(shift => shift.teamId))
  const byTeam = new Map<string, ShiftsNowDto['teams'][number]>()
  for (const shift of shifts) {
    let team = byTeam.get(shift.teamId)
    if (!team) byTeam.set(shift.teamId, team = { teamId: shift.teamId, teamName: (teams.get(shift.teamId)?.name ?? shift.teamId) as Translated, leads: [], shifts: [] })
    const assignees = shift.assignees.filter(item => item.status === 'assigned' || item.status === 'attended')
    const { teamName: _teamName, filled: _filled, ...rest } = shift
    team.shifts.push({ ...rest, assignees })
    for (const assignee of assignees) {
      if (team.leads.some(lead => lead.userId === assignee.userId)) continue
      if (await isTeamLead(event, assignee.userId, shift.teamId)) team.leads.push(assignee.person)
    }
  }
  return { operationId, at: at.toISOString(), teams: [...byTeam.values()] }
}

/**
 * The people staff could assign to a shift: the explicit members of its team who hold their role (approved crew and
 * members added in Teams), `q` matching the name, with whether they are eligible for the shift role, and the guards they
 * would break. Mapped-only people are not listed: they cannot be assigned.
 */
export async function shiftsCandidates(event: H3Event, entry: { shift: ShiftRow, schedule: ShiftScheduleRow }, q: string | undefined, pii: boolean, shiftRoleId?: string): Promise<ShiftCandidateDto[]> {
  const { shift, schedule } = entry
  const members = await db.select({ userId: schema.teamMembers.userId, role: schema.teamMembers.role, status: schema.teamMembers.status })
    .from(schema.teamMembers).where(eq(schema.teamMembers.teamId, shift.teamId)).limit(1000)
  const holding = members.filter(member => teamMemberStatusGrants(member.status))
  const users = await shiftsUsersById(holding.map(member => member.userId))
  const needle = q?.toLowerCase()
  // The role the person would hold: the one asked for, else the shift's own.
  const role = shiftRoleId ? await shiftsRoleOfOr400(schedule.id, shift.teamId, shiftRoleId) : await shiftsRoleById(shift.shiftRoleId)
  const result: ShiftCandidateDto[] = []
  for (const member of holding) {
    const user = users.get(member.userId)
    if (needle && !(user?.name ?? '').toLowerCase().includes(needle) && !(pii && (user?.email ?? '').toLowerCase().includes(needle))) continue
    const eligibility = await shiftsEligibility(event, member.userId, shift.teamId, role)
    const assigned = !!await shiftsActiveAssignmentOf(shift.id, member.userId)
    result.push({
      ...toShiftPersonDto(member.userId, user, pii),
      role: eligibility.role ?? member.role,
      eligible: eligibility.eligible && !assigned,
      reason: assigned ? 'assigned' : eligibility.reason === 'role' ? 'role' : null,
      warnings: assigned ? [] : await shiftsGuardWarningsFor(event, member.userId, entry),
    })
  }
  return result.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.name ?? '').localeCompare(b.name ?? ''))
}

/** The teams of operations a user leads (a role at or above the ladder's `leadFrom`, explicit or mapped). */
export async function shiftsLedTeams(event: H3Event, userId: number): Promise<ShiftsLedTeamDto[]> {
  const grants = (await resolveAllTeamRoles(event, userId)).filter(grant => grant.ownerType === 'operation' && grant.ownerId)
  const led: typeof grants = []
  for (const grant of grants) if (await isTeamLead(event, userId, grant.teamId)) led.push(grant)
  if (!led.length) return []
  const [teams, operations] = await Promise.all([
    shiftsTeamsById(led.map(grant => grant.teamId)),
    db.select({ id: schema.operations.id, name: schema.operations.name }).from(schema.operations).where(inArray(schema.operations.id, led.map(grant => grant.ownerId!))),
  ])
  return led.map(grant => ({
    teamId: grant.teamId,
    teamName: (teams.get(grant.teamId)?.name ?? grant.teamId) as Translated,
    operationId: grant.ownerId!,
    operationName: (operations.find(item => item.id === grant.ownerId)?.name ?? grant.ownerId!) as Translated,
  }))
}

/** The teams of an operation, in the order staff set, with their kind's ladder: what the Shifts tab's forms need. */
export async function shiftsOperationTeams(event: H3Event, operationId: string): Promise<ShiftsOperationTeamDto[]> {
  const [rows, ladders] = await Promise.all([
    db.select().from(schema.teams).where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId)))
      .orderBy(asc(schema.teams.sort), asc(schema.teams.createdAt), asc(schema.teams.id)),
    loadTeamLadders(event),
  ])
  return rows.map((team) => {
    const ladder = ladders[team.kind]
    return {
      id: team.id,
      kind: team.kind,
      name: team.name as Translated,
      ladder: ladder ? { roles: ladder.roles.map(role => ({ key: role.key, label: role.label as Translated })), leadFrom: ladder.leadFrom ?? null } : null,
    }
  })
}
