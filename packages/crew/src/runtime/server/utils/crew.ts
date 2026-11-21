import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { aliasedTable, and, asc, count, desc, eq, exists, gt, inArray, isNotNull, isNull, lt, max, ne, not, or, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { apiError, conflict, likeContains, notFound, orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { CrewApplyDto, CrewMemberDto, CrewStatus, MyCrewDto, Translated } from '../../../types'
import { ladderKeys } from '@frigear-nu/teams/utils'
import { crewAccess } from '../../access'
import { canMoveCrew, newId, teamStatusOf, translate } from '../../utils'
import { toCrewMemberDto, toMyCrewDto } from './crew-dto'
import type { CrewTeamLite, CrewUserLite } from './crew-dto'
import { crewSendStatusEmail } from './crew-emails'
import type { crewMembersQuery } from './crew-schemas'
import { crewApprovedCount, crewDefaultTeamOf, crewLowestRole, crewOperationTeams, findCrewOperationTeam, findCrewSettings, getCrewOperationTeamOr400 } from './crew-settings'
import type { CrewSettingsRow, CrewTeamRow } from './crew-settings'
import { crewHashToken } from './crew-tokens'

export type CrewMemberRow = typeof schema.teamMembers.$inferSelect
export type CrewOperationRow = typeof schema.operations.$inferSelect
/** A crew membership with its team. */
export type CrewEntry = { member: CrewMemberRow, team: CrewTeamRow }
type MembersQuery = z.output<typeof crewMembersQuery>
type CrewHookName = 'crew:member:applied' | 'crew:member:approved' | 'crew:member:rejected' | 'crew:member:waitlisted' | 'crew:member:withdrawn'

const operationTeamOwned = (operationId: string): SQL =>
  and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId))!

// --- Reading ---------------------------------------------------------------------------------

/** The name, email, avatar and phone number of users, by id. */
export async function crewUsersById(ids: number[]): Promise<Map<number, NonNullable<CrewUserLite>>> {
  if (!ids.length) return new Map()
  const rows = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar, phone: schema.users.phone })
    .from(schema.users).where(inArray(schema.users.id, [...new Set(ids)]))
  return new Map(rows.map(row => [Number(row.id), { name: row.name ?? null, email: row.email ?? null, avatar: row.avatar ?? null, phone: row.phone ?? null }]))
}

/**
 * The crew membership of a user in an operation, or `undefined`: a `team_members` row with a `crewStatus` on a team the
 * operation owns. Rows teams staff added by hand (no `crewStatus`) are not crew memberships.
 */
export async function findCrewEntry(userId: number, operationId: string): Promise<CrewEntry | undefined> {
  const [row] = await db.select({ member: schema.teamMembers, team: schema.teams }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.userId, userId), operationTeamOwned(operationId), isNotNull(schema.teamMembers.crewStatus)))
    .orderBy(asc(schema.teamMembers.createdAt), asc(schema.teamMembers.id)).limit(1)
  return row
}

/** The crew membership with this row id, or a 404. */
export async function getCrewEntryOr404(id: string): Promise<CrewEntry> {
  const [row] = await db.select({ member: schema.teamMembers, team: schema.teams }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teamMembers.id, id), eq(schema.teams.ownerType, 'operation'), isNotNull(schema.teamMembers.crewStatus))).limit(1)
  if (!row) throw notFound('Crew member not found.')
  return row
}

/** Whether the user holds a role on a team of the operation that crew did not create (a hand-added teams member). */
export async function crewHasPlainMembership(userId: number, operationId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(
      eq(schema.teamMembers.userId, userId),
      operationTeamOwned(operationId),
      isNull(schema.teamMembers.crewStatus),
      or(isNull(schema.teamMembers.status), eq(schema.teamMembers.status, 'active')),
    )).limit(1)
  return !!row
}

/**
 * SQL that is true when the user was approved in an operation that started before this one: "previous crew".
 * `user` is a column of the outer query (the list) or a user id.
 */
function crewPreviousExists(operation: Pick<CrewOperationRow, 'id' | 'startsAt'>, user: AnyColumn | number): SQL {
  const prev = aliasedTable(schema.teamMembers, 'prev_member')
  const prevTeam = aliasedTable(schema.teams, 'prev_team')
  return exists(db.select({ one: sql`1` }).from(prev)
    .innerJoin(prevTeam, eq(prev.teamId, prevTeam.id))
    .innerJoin(schema.operations, eq(schema.operations.id, prevTeam.ownerId))
    .where(and(
      eq(prev.userId, user),
      eq(prev.crewStatus, 'approved'),
      eq(prevTeam.ownerType, 'operation'),
      ne(schema.operations.id, operation.id),
      lt(schema.operations.startsAt, operation.startsAt),
    )))
}

/** Whether the user was approved in an earlier operation. */
export async function crewIsPreviousCrew(operation: Pick<CrewOperationRow, 'id' | 'startsAt'>, userId: number): Promise<boolean> {
  const [row] = await db.select({ found: sql<number>`case when ${crewPreviousExists(operation, userId)} then 1 else 0 end` }).from(schema.operations)
    .where(eq(schema.operations.id, operation.id)).limit(1)
  return Number(row?.found ?? 0) === 1
}

const teamLite = (team: CrewTeamRow): CrewTeamLite => ({ id: team.id, name: team.name, ownerId: team.ownerId ?? null })

/** The DTO of one crew member; `pii` copies the email and phone number into it. */
export async function crewMemberDtoOf(entry: CrewEntry, operation: Pick<CrewOperationRow, 'id' | 'startsAt'>, pii: boolean): Promise<CrewMemberDto> {
  const [users, previous] = await Promise.all([crewUsersById([entry.member.userId]), crewIsPreviousCrew(operation, entry.member.userId)])
  return toCrewMemberDto({ member: entry.member, team: teamLite(entry.team), user: users.get(entry.member.userId), previous, pii })
}

/** The DTO a staff response carries for a crew member: with the contact details only for a caller holding `crew:pii`. */
export async function crewMemberResponse(event: H3Event, entry: CrewEntry): Promise<CrewMemberDto> {
  const operation = await getOperationOr404(entry.team.ownerId!)
  return crewMemberDtoOf(entry, operation, await allows(event, crewAccess.permissions.pii))
}

/** The label of a role on the ladder of a team kind, as stored (a plain text or one per language); the key when unknown. */
export async function crewRoleLabelOf(event: H3Event, kind: string, role: string): Promise<Translated> {
  return (await loadTeamLadders(event))[kind]?.roles.find(item => item.key === role)?.label ?? role
}

/** The label of a role on the ladder of a team kind, in `locale`. */
export async function crewRoleLabel(event: H3Event, kind: string, role: string, locale = 'en'): Promise<string> {
  const ladder = (await loadTeamLadders(event))[kind]
  return translate(ladder?.roles.find(item => item.key === role)?.label, locale, 'en') || role
}

/** My own crew status for one entry, with the role's label. */
export async function crewMyEntryOf(event: H3Event, entry: CrewEntry, operation: Pick<CrewOperationRow, 'slug' | 'name'>): Promise<MyCrewDto> {
  return toMyCrewDto({ member: entry.member, team: teamLite(entry.team), operation, roleLabel: await crewRoleLabelOf(event, entry.team.kind, entry.member.role) })
}

/** My crew status in every operation I applied to or work at. */
export async function crewMyEntries(event: H3Event, userId: number): Promise<MyCrewDto[]> {
  const rows = await db.select({ member: schema.teamMembers, team: schema.teams, operation: schema.operations }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .innerJoin(schema.operations, eq(schema.operations.id, schema.teams.ownerId))
    .where(and(eq(schema.teamMembers.userId, userId), eq(schema.teams.ownerType, 'operation'), isNotNull(schema.teamMembers.crewStatus)))
    .orderBy(desc(schema.operations.startsAt))
  return Promise.all(rows.map(async row => toMyCrewDto({ member: row.member, team: teamLite(row.team), operation: row.operation, roleLabel: await crewRoleLabelOf(event, row.team.kind, row.member.role) })))
}

/** The ids of the operations a user is approved crew of: what the viewer's `operationIds` get. */
export async function crewApprovedOperationIds(userId: number): Promise<string[]> {
  const rows = await db.selectDistinct({ operationId: schema.teams.ownerId }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(
      eq(schema.teamMembers.userId, userId),
      eq(schema.teamMembers.crewStatus, 'approved'),
      eq(schema.teamMembers.status, 'active'),
      eq(schema.teams.ownerType, 'operation'),
    ))
  return rows.flatMap(row => row.operationId ? [row.operationId] : [])
}

/**
 * Whether a user may read an operation, by the rule of `operations:read`: a public operation, one they take part in, or
 * `operations:manage`. A private operation takes no applications from people who cannot read it.
 */
export async function crewUserReadsOperation(event: H3Event, operation: Pick<CrewOperationRow, 'id' | 'public'>, userId: number): Promise<boolean> {
  if (operation.public) return true
  const user = await loadAuthUser(userId)
  if (!user) return false
  const viewer = await resolveOperationsViewer(event, user)
  return operationReadable(operation, viewer, await userCan(event, userId, 'operations:manage'))
}

/** Whether applications to an operation are open now, by its form, status and window. */
export function crewOpenState(operation: Pick<CrewOperationRow, 'status'>, settings: CrewSettingsRow | undefined, now = new Date()): 'open' | 'scheduled' | 'closed' | 'unavailable' {
  if (!settings?.formId) return 'unavailable'
  if (operation.status === 'archived' || operation.status === 'wrapped_up') return 'closed'
  if (settings.opensAt && now.getTime() < settings.opensAt.getTime()) return 'scheduled'
  if (settings.closesAt && now.getTime() >= settings.closesAt.getTime()) return 'closed'
  return 'open'
}

/** What the apply page shows for this user: the form, or the reason why not. */
export async function crewApplyDto(operation: CrewOperationRow, settings: CrewSettingsRow | undefined, userId: number): Promise<CrewApplyDto> {
  const entry = await findCrewEntry(userId, operation.id)
  const status = (entry?.member.crewStatus ?? null) as CrewStatus | null
  let state: CrewApplyDto['state'] | undefined
  if (status === 'applied' || status === 'waitlisted' || status === 'approved') state = 'applied'
  else if (status === 'rejected') state = 'rejected'
  else if (!entry && await crewHasPlainMembership(userId, operation.id)) state = 'member'
  let formSlug: string | null = null
  if (!state) {
    state = crewOpenState(operation, settings)
    if (state === 'open') {
      const [form] = await db.select({ slug: schema.forms.slug, status: schema.forms.status }).from(schema.forms).where(eq(schema.forms.id, settings!.formId!)).limit(1)
      if (form?.status === 'published') formSlug = form.slug
      else state = 'unavailable'
    }
  }
  return {
    operationId: operation.id,
    operationSlug: operation.slug,
    operationName: operation.name,
    state,
    crewStatus: status,
    formSlug,
    opensAt: settings?.opensAt?.toISOString() ?? null,
    closesAt: settings?.closesAt?.toISOString() ?? null,
  }
}

/** Keeps the phone number of an application on the user (shown with `crew:pii`); anything but a non-empty string is ignored. */
export async function crewStorePhone(userId: number, value: unknown): Promise<void> {
  if (typeof value !== 'string') return
  const phone = value.trim().slice(0, 40)
  if (!phone) return
  await db.update(schema.users).set({ phone }).where(eq(schema.users.id, userId))
}

// --- Writing ---------------------------------------------------------------------------------

async function crewFire(event: H3Event, name: CrewHookName, operationId: string, member: CrewMemberDto): Promise<void> {
  await useNitroApp().hooks.callHook(name, { event, operationId, member })
}

/** The primary language tag of the request (`da-DK,da;q=0.9` is `da`), or `undefined`. */
export function crewRequestLocale(event: H3Event): string | undefined {
  const tag = getRequestHeader(event, 'accept-language')?.split(',')[0]?.trim().split(/[-_;]/)[0]?.toLowerCase()
  return tag && /^[a-z]{2,3}$/.test(tag) ? tag : undefined
}

const primaryLocale = (locale: string | undefined) => locale?.split(/[-_]/)[0]?.toLowerCase() || undefined

/**
 * Fires the teams member hooks for a change of a crew row, which teams' own routes would have fired. They follow the
 * grant: `added` when the row starts to hold its role (approved), `removed` when it stops, `role-changed` when an
 * approved person's role changes, and `removed` then `added` when an approved person moves to another team.
 */
async function crewFireTeamsHooks(event: H3Event, before: CrewEntry | undefined, after: CrewEntry): Promise<void> {
  const hadGrant = !!before && teamMemberStatusGrants(before.member.status)
  const hasGrant = teamMemberStatusGrants(after.member.status)
  const hooks = useNitroApp().hooks
  const ctxOf = async (entry: CrewEntry) => ({ event, team: await toAdminTeamDtoOf(event, entry.team), member: await teamMemberDtoOf(entry.member, true) })
  if (!hadGrant && hasGrant) return hooks.callHook('teams:member:added', await ctxOf(after))
  if (hadGrant && !hasGrant) return hooks.callHook('teams:member:removed', await ctxOf(before!))
  if (!hadGrant || !hasGrant) return
  if (before!.team.id !== after.team.id) {
    await hooks.callHook('teams:member:removed', await ctxOf(before!))
    return hooks.callHook('teams:member:added', await ctxOf(after))
  }
  if (before!.member.role !== after.member.role) {
    await hooks.callHook('teams:member:role-changed', { ...await ctxOf(after), from: before!.member.role, to: after.member.role })
  }
}

type CrewColumns = Partial<Pick<typeof schema.teamMembers.$inferInsert, 'crewStatus' | 'appliedAt' | 'decidedAt' | 'decidedBy' | 'submissionId' | 'waitlistPosition' | 'waitlistReason' | 'locale'>>

/**
 * Adds a crew membership in one insert, crew columns included, so a failure cannot leave a half-written row that blocks
 * the person from applying again. 409 when the person is on the team already.
 */
async function crewInsertMember(event: H3Event, input: CrewColumns & { team: CrewTeamRow, userId: number, role: string, crewStatus: CrewStatus, addedBy: number | null, fire?: boolean }): Promise<CrewEntry> {
  const { team, userId, role, addedBy, fire = true, ...columns } = input
  const taken = () => conflict('This user is a member of the team already.', { field: 'userId' })
  if (await findTeamMember(team.id, userId)) throw taken()
  const [member] = await db.insert(schema.teamMembers).values({ id: newId('tmm'), teamId: team.id, userId, role, status: teamStatusOf(input.crewStatus), addedBy, ...columns }).returning().catch((error: unknown) => {
    if (isTeamsUniqueViolation(error)) throw taken()
    throw error
  })
  forgetTeamRoles(event)
  const entry = { member: member!, team }
  if (fire) await crewFireTeamsHooks(event, undefined, entry)
  return entry
}

/**
 * Writes a crew row only if it still has the crew status the caller read (a conditional update), keeping teams' `status`
 * in step. `undefined` when somebody else changed it first. Fires nothing.
 */
async function crewWrite(event: H3Event, before: CrewEntry, patch: CrewColumns & { teamId?: string, role?: string }): Promise<CrewEntry | undefined> {
  const values: Partial<typeof schema.teamMembers.$inferInsert> = { ...patch }
  if (patch.crewStatus) values.status = teamStatusOf(patch.crewStatus as CrewStatus)
  const current = before.member.crewStatus
  const [member] = await db.update(schema.teamMembers).set(values).where(and(
    eq(schema.teamMembers.id, before.member.id),
    current === null ? isNull(schema.teamMembers.crewStatus) : eq(schema.teamMembers.crewStatus, current),
  )).returning()
  if (!member) return undefined
  forgetTeamRoles(event)
  const team = patch.teamId && patch.teamId !== before.team.id ? (await findTeamById(patch.teamId)) ?? before.team : before.team
  return { member, team }
}

/**
 * `crewWrite` and the teams hooks. When the row changed under the caller (`changed: false`), `entry` is its current state
 * and nothing was written or fired: the caller must not fire its own hooks or send emails either.
 */
async function crewUpdateMember(event: H3Event, before: CrewEntry, patch: CrewColumns & { teamId?: string, role?: string }): Promise<{ entry: CrewEntry, changed: boolean }> {
  const written = await crewWrite(event, before, patch)
  if (!written) return { entry: await getCrewEntryOr404(before.member.id).catch(() => before), changed: false }
  await crewFireTeamsHooks(event, before, written)
  return { entry: written, changed: true }
}

/** The next place on an operation's waiting list. Positions may repeat when requests race: the list orders by position, then by when people applied. */
async function crewNextWaitlistPosition(operationId: string): Promise<number> {
  const [row] = await db.select({ top: max(schema.teamMembers.waitlistPosition) }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(operationTeamOwned(operationId), eq(schema.teamMembers.crewStatus, 'waitlisted')))
  return Number(row?.top ?? 0) + 1
}

/** Emails the person about their new status, in the locale stored on their row; a failing email is logged, never thrown. */
async function crewNotify(event: H3Event, entry: CrewEntry, operation: CrewOperationRow, settings: CrewSettingsRow | undefined, status: CrewStatus): Promise<void> {
  const member = await crewMemberDtoOf(entry, operation, true)
  const locale = entry.member.locale ?? undefined
  await crewSendStatusEmail(event, {
    status,
    member,
    operationName: operation.name,
    roleLabel: await crewRoleLabel(event, entry.team.kind, entry.member.role, locale),
    settings,
    locale,
  })
}

/** Where a new application lands: `waitlisted` when the approved crew reached the capacity and there is a list. */
async function crewApplyStatus(operationId: string, settings: CrewSettingsRow | undefined): Promise<'applied' | 'waitlisted'> {
  if (!settings || settings.capacity === null || !settings.waitlist) return 'applied'
  return await crewApprovedCount(operationId) >= settings.capacity ? 'waitlisted' : 'applied'
}

/**
 * Registers an application: a new `applied` (or `waitlisted`, because the crew is full) person on the operation's default
 * team holding its lowest role without a grant. A person who has applied already is left as they are (`created: false`;
 * a withdrawn one reopens their application, `created: true`), and `null` is returned for someone who already works on a
 * team of the operation through teams.
 */
export async function crewApply(event: H3Event, input: { operation: CrewOperationRow, settings: CrewSettingsRow | undefined, userId: number, submissionId: string | null, locale?: string }): Promise<{ entry: CrewEntry, created: boolean } | null> {
  const { operation, settings, userId, submissionId } = input
  const locale = primaryLocale(input.locale) ?? null
  const now = new Date()
  const existing = await findCrewEntry(userId, operation.id)
  let entry: CrewEntry
  if (existing) {
    if (existing.member.crewStatus !== 'withdrawn') {
      if (submissionId && existing.member.crewStatus !== 'rejected' && submissionId !== existing.member.submissionId) {
        await db.update(schema.teamMembers).set({ submissionId }).where(eq(schema.teamMembers.id, existing.member.id))
      }
      return { entry: existing, created: false }
    }
    const status = await crewApplyStatus(operation.id, settings)
    const reopened = await crewUpdateMember(event, existing, {
      crewStatus: status,
      appliedAt: now,
      decidedAt: null,
      decidedBy: null,
      submissionId,
      locale,
      waitlistPosition: status === 'waitlisted' ? await crewNextWaitlistPosition(operation.id) : null,
      waitlistReason: status === 'waitlisted' ? 'capacity' : null,
    })
    if (!reopened.changed) return { entry: reopened.entry, created: false }
    entry = reopened.entry
  }
  else {
    if (await crewHasPlainMembership(userId, operation.id)) return null
    const team = await crewDefaultTeamOf(event, operation.id, settings)
    const status = await crewApplyStatus(operation.id, settings)
    entry = await crewInsertMember(event, {
      team,
      userId,
      role: await crewLowestRole(event, team.kind),
      crewStatus: status,
      appliedAt: now,
      submissionId,
      locale,
      waitlistPosition: status === 'waitlisted' ? await crewNextWaitlistPosition(operation.id) : null,
      waitlistReason: status === 'waitlisted' ? 'capacity' : null,
      addedBy: null,
    })
  }
  const status = entry.member.crewStatus as CrewStatus
  const dto = await crewMemberDtoOf(entry, operation, true)
  await crewFire(event, 'crew:member:applied', operation.id, dto)
  if (status === 'waitlisted') await crewFire(event, 'crew:member:waitlisted', operation.id, dto)
  await crewNotify(event, entry, operation, settings, status)
  return { entry, created: true }
}

/**
 * Moves a crew member to `approved`, `rejected` or `waitlisted`. Approving may also set the team (of the same operation)
 * and role. Asking for the status the person has is a no-op, so a double click does no harm; any other move the status
 * table does not allow is a 409. The write is conditional on the status that was read: when somebody else moved the person
 * first, the current row comes back and no hook fires and no email goes out. Fires the crew hook and sends the status email;
 * a person leaving `approved` frees a place on the waiting list. Staff approval does not check the capacity.
 */
export async function crewDecide(event: H3Event, id: string, to: 'approved' | 'rejected' | 'waitlisted', options: { by: number | null, teamId?: string, role?: string } = { by: null }): Promise<CrewEntry> {
  const entry = await getCrewEntryOr404(id)
  const from = entry.member.crewStatus as CrewStatus
  const operationId = entry.team.ownerId!
  const operation = await getOperationOr404(operationId)
  const settings = await findCrewSettings(operationId)

  let team = entry.team
  let role = entry.member.role
  if (options.teamId && options.teamId !== team.id) {
    team = await getCrewOperationTeamOr400(operationId, options.teamId)
    if (await findTeamMember(team.id, entry.member.userId)) throw conflict('This person is on that team already.', { field: 'teamId' })
    const keys = ladderKeys((await loadTeamLadders(event))[team.kind])
    if (!keys.includes(role)) role = keys[0] ?? role
  }
  if (options.role) role = options.role
  const retargets = team.id !== entry.team.id || role !== entry.member.role
  if (retargets) await assertTeamRoleOnLadder(event, team.kind, role)

  const moves = from !== to
  if (!moves && !retargets) return entry
  if (moves && !canMoveCrew(from, to)) throw apiError(409, 'crew_invalid_transition', `A person who is ${from} cannot be ${to}.`)

  const result = await crewUpdateMember(event, entry, {
    crewStatus: to,
    decidedAt: new Date(),
    decidedBy: options.by,
    // Staff waitlisting is sticky: only people waitlisted because the crew was full are promoted automatically.
    waitlistPosition: to === 'waitlisted' ? (from === 'waitlisted' ? entry.member.waitlistPosition : await crewNextWaitlistPosition(operationId)) : null,
    waitlistReason: to === 'waitlisted' ? (from === 'waitlisted' ? entry.member.waitlistReason : 'manual') : null,
    ...(team.id !== entry.team.id ? { teamId: team.id } : {}),
    ...(role !== entry.member.role ? { role } : {}),
  })
  if (!result.changed || !moves) return result.entry
  const updated = result.entry
  await crewFire(event, `crew:member:${to}`, operationId, await crewMemberDtoOf(updated, operation, true))
  await crewNotify(event, updated, operation, settings, to)
  // The person just demoted is waitlisted by hand, so the promotion below skips them.
  if (from === 'approved') await crewPromoteWaitlist(event, operation, settings)
  return updated
}

/**
 * Approves people in turn. People who cannot be approved because of what they are (unknown, another operation's, in a
 * status that cannot become approved: a 4xx) come back in `skipped`; any other failure is thrown.
 */
export async function crewApproveMany(event: H3Event, operationId: string, ids: string[], by: number | null): Promise<{ approved: CrewEntry[], skipped: string[] }> {
  const approved: CrewEntry[] = []
  const skipped: string[] = []
  for (const id of ids) {
    const entry = await getCrewEntryOr404(id).catch(() => undefined)
    if (!entry || entry.team.ownerId !== operationId || entry.member.crewStatus === 'approved') {
      skipped.push(id)
      continue
    }
    try {
      approved.push(await crewDecide(event, id, 'approved', { by }))
    }
    catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (typeof status === 'number' && status >= 400 && status < 500) skipped.push(id)
      else throw error
    }
  }
  return { approved, skipped }
}

/** Withdraws the caller's own application or place. 404 when they have none, 409 when it is over already. */
export async function crewWithdraw(event: H3Event, userId: number, operationId: string): Promise<CrewEntry> {
  const entry = await findCrewEntry(userId, operationId)
  if (!entry) throw notFound('You have not applied to this crew.')
  const from = entry.member.crewStatus as CrewStatus
  if (from === 'rejected' || from === 'withdrawn') throw apiError(409, 'crew_not_withdrawable', `Your application is ${from}.`)
  const operation = await getOperationOr404(operationId)
  const settings = await findCrewSettings(operationId)
  const result = await crewUpdateMember(event, entry, { crewStatus: 'withdrawn', decidedAt: new Date(), decidedBy: null, waitlistPosition: null, waitlistReason: null })
  if (!result.changed) return result.entry
  await crewFire(event, 'crew:member:withdrawn', operationId, await crewMemberDtoOf(result.entry, operation, true))
  await crewNotify(event, result.entry, operation, settings, 'withdrawn')
  if (from === 'approved') await crewPromoteWaitlist(event, operation, settings)
  return result.entry
}

/** Moves a crew member to another team and/or role of the same operation (an approved person keeps their grant). */
export async function crewMove(event: H3Event, id: string, input: { teamId?: string, role?: string }): Promise<CrewEntry> {
  const entry = await getCrewEntryOr404(id)
  const operationId = entry.team.ownerId!
  let team = entry.team
  let role = entry.member.role
  if (input.teamId && input.teamId !== team.id) {
    team = await getCrewOperationTeamOr400(operationId, input.teamId)
    if (await findTeamMember(team.id, entry.member.userId)) throw conflict('This person is on that team already.', { field: 'teamId' })
    const keys = ladderKeys((await loadTeamLadders(event))[team.kind])
    if (!keys.includes(role)) role = keys[0] ?? role
  }
  if (input.role) role = input.role
  await assertTeamRoleOnLadder(event, team.kind, role)
  if (team.id === entry.team.id && role === entry.member.role) return entry
  return (await crewUpdateMember(event, entry, {
    ...(team.id !== entry.team.id ? { teamId: team.id } : {}),
    ...(role !== entry.member.role ? { role } : {}),
  })).entry
}

/**
 * Fills the places the approved crew leaves free from the waiting list (when the operation has a capacity and a list), but
 * only with people who were waitlisted because the crew was full (`waitlistReason: 'capacity'`): staff waitlisting is
 * sticky. Previous crew go first when the setting is on, then in the order people joined the list. Each candidate is
 * claimed with a conditional update and the capacity is checked again after the claim, so two requests promoting at once
 * cannot overfill the crew: the claim that went over is put back. A promotion fires the same hooks and email as an approval.
 */
export async function crewPromoteWaitlist(event: H3Event, operation: CrewOperationRow, settings: CrewSettingsRow | undefined): Promise<CrewEntry[]> {
  if (!settings || settings.capacity === null || !settings.waitlist) return []
  const promoted: CrewEntry[] = []
  for (let guard = 0; guard < 500; guard++) {
    if (await crewApprovedCount(operation.id) >= settings.capacity) break
    const previous = sql<number>`case when ${crewPreviousExists(operation, schema.teamMembers.userId)} then 1 else 0 end`
    const [next] = await db.select({ id: schema.teamMembers.id }).from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .where(and(operationTeamOwned(operation.id), eq(schema.teamMembers.crewStatus, 'waitlisted'), eq(schema.teamMembers.waitlistReason, 'capacity')))
      .orderBy(...(settings.previousCrewFirst ? [desc(previous)] : []), asc(schema.teamMembers.waitlistPosition), asc(schema.teamMembers.appliedAt), asc(schema.teamMembers.id))
      .limit(1)
    if (!next) break
    const candidate = await getCrewEntryOr404(next.id).catch(() => undefined)
    if (!candidate || candidate.member.crewStatus !== 'waitlisted') continue
    const claimed = await crewWrite(event, candidate, { crewStatus: 'approved', decidedAt: new Date(), decidedBy: null, waitlistPosition: null, waitlistReason: null })
    if (!claimed) continue
    if (await crewApprovedCount(operation.id) > settings.capacity) {
      await crewWrite(event, claimed, {
        crewStatus: 'waitlisted',
        decidedAt: candidate.member.decidedAt,
        decidedBy: candidate.member.decidedBy,
        waitlistPosition: candidate.member.waitlistPosition,
        waitlistReason: 'capacity',
      })
      break
    }
    await crewFireTeamsHooks(event, candidate, claimed)
    await crewFire(event, 'crew:member:approved', operation.id, await crewMemberDtoOf(claimed, operation, true))
    await crewNotify(event, claimed, operation, settings, 'approved')
    promoted.push(claimed)
  }
  return promoted
}

// --- Invites ---------------------------------------------------------------------------------

const gone = (code: 'invite_revoked' | 'invite_expired' | 'invite_used' | 'invite_unavailable', message: string) => apiError(410, code, message)

/**
 * Accepts an invite link for a signed-in user: the invite's team, approved, with the invite's role. A use is claimed
 * atomically (`uses < maxUses`, not revoked, not expired), so a link with one use adds exactly one person even when it
 * is opened twice at once; the use is given back only when writing the membership itself fails, not when a hook listener
 * throws afterwards. 404 for an unknown token, 410 for a link that is revoked, expired or used up. 409
 * `crew_already_member` when the user is approved anywhere in the operation (or holds a role there through teams), and 409
 * `crew_rejected` for a rejected applicant: staff's decision wins. An applicant who is waiting or withdrawn is moved onto
 * the team. An invite does not check the capacity.
 */
export async function crewAcceptInvite(event: H3Event, token: string, userId: number): Promise<MyCrewDto> {
  const tokenHash = await crewHashToken(token)
  const [invite] = await db.select().from(schema.crewInvites).where(eq(schema.crewInvites.tokenHash, tokenHash)).limit(1)
  if (!invite) throw notFound('This invite link is not valid.')
  const reasonOf = (row: typeof invite) => row.revokedAt
    ? gone('invite_revoked', 'This invite link was revoked.')
    : row.expiresAt && row.expiresAt.getTime() <= Date.now()
      ? gone('invite_expired', 'This invite link has expired.')
      : gone('invite_used', 'This invite link has been used up.')
  if (invite.revokedAt || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) || invite.uses >= invite.maxUses) throw reasonOf(invite)

  const team = await findCrewOperationTeam(invite.operationId, invite.teamId)
  if (!team) throw gone('invite_unavailable', 'The team of this invite no longer exists.')
  const operation = await getOperationOr404(invite.operationId)
  await assertTeamRoleOnLadder(event, team.kind, invite.role)

  const existing = await findCrewEntry(userId, invite.operationId)
  const atTeam = await findTeamMember(team.id, userId)
  if (existing?.member.crewStatus === 'approved' || await crewHasPlainMembership(userId, invite.operationId)) {
    throw apiError(409, 'crew_already_member', 'You are on this crew already.')
  }
  if (existing?.member.crewStatus === 'rejected') throw apiError(409, 'crew_rejected', 'Your application was rejected, so an invite cannot add you.')

  const now = new Date()
  const claimed = await db.update(schema.crewInvites).set({ uses: sql`${schema.crewInvites.uses} + 1` }).where(and(
    eq(schema.crewInvites.id, invite.id),
    isNull(schema.crewInvites.revokedAt),
    lt(schema.crewInvites.uses, schema.crewInvites.maxUses),
    or(isNull(schema.crewInvites.expiresAt), gt(schema.crewInvites.expiresAt, now)),
  )).returning({ id: schema.crewInvites.id })
  if (!claimed.length) {
    const [fresh] = await db.select().from(schema.crewInvites).where(eq(schema.crewInvites.id, invite.id)).limit(1)
    throw fresh ? reasonOf(fresh) : notFound('This invite link is not valid.')
  }

  // The row the invite fills: the person's row on the team, else their crew row elsewhere (moved here), else a new one.
  const base: CrewEntry | undefined = atTeam ? { member: atTeam, team } : existing
  const decided = { crewStatus: 'approved' as const, decidedAt: now, decidedBy: invite.createdBy ?? null, waitlistPosition: null, waitlistReason: null }
  let entry: CrewEntry
  try {
    if (base) {
      const result = await crewWrite(event, base, {
        ...decided,
        role: invite.role,
        ...(base.team.id !== team.id ? { teamId: team.id } : {}),
        ...(base.member.crewStatus ? {} : { appliedAt: now }),
        ...(base.member.locale ? {} : { locale: crewRequestLocale(event) ?? null }),
      })
      if (!result) throw apiError(409, 'conflict', 'Your crew status changed meanwhile. Try the link again.')
      entry = result
      // A second crew row of the same person elsewhere in the operation would double count them: it is withdrawn.
      if (existing && existing.member.id !== base.member.id) {
        await crewWrite(event, existing, { crewStatus: 'withdrawn', decidedAt: now, decidedBy: null, waitlistPosition: null, waitlistReason: null })
      }
    }
    else {
      // The teams hooks run below, after the membership is safely written.
      entry = await crewInsertMember(event, { team, userId, role: invite.role, appliedAt: now, addedBy: invite.createdBy ?? null, locale: crewRequestLocale(event) ?? null, fire: false, ...decided })
    }
  }
  catch (error) {
    // The use was not spent on anybody: give it back. (Hook listeners run after this block and never give it back.)
    await db.update(schema.crewInvites).set({ uses: sql`${schema.crewInvites.uses} - 1` }).where(eq(schema.crewInvites.id, invite.id))
    throw error
  }

  const settings = await findCrewSettings(operation.id)
  await crewFireTeamsHooks(event, base, entry)
  await crewFire(event, 'crew:member:approved', operation.id, await crewMemberDtoOf(entry, operation, true))
  await crewNotify(event, entry, operation, settings, 'approved')
  return toMyCrewDto({ member: entry.member, team: teamLite(entry.team), operation, roleLabel: await crewRoleLabelOf(event, entry.team.kind, entry.member.role) })
}

// --- Staff list ------------------------------------------------------------------------------

/** The ids of the teams of an operation that a user leads (the ladder's lead role and up). */
export async function crewLedTeamIds(event: H3Event, userId: number, operationId: string): Promise<string[]> {
  const led: string[] = []
  for (const team of await crewOperationTeams(operationId)) {
    if (await isTeamLead(event, userId, team.id)) led.push(team.id)
  }
  return led
}

/**
 * One page of an operation's crew. `teamIds` limits it to those teams (what a lead may read; `[]` is nobody) and `pii`
 * copies emails and phone numbers into the rows and lets the search match them.
 */
export async function crewMembersPage(operation: CrewOperationRow, query: MembersQuery, scope: { teamIds?: string[], pii: boolean }): Promise<Page<CrewMemberDto>> {
  if (scope.teamIds && !scope.teamIds.length) return paginate({ items: [], total: 0, query })
  const previous = crewPreviousExists(operation, schema.teamMembers.userId)
  const search = query.q
    ? or(likeContains(schema.users.name, query.q), scope.pii ? likeContains(schema.users.email, query.q) : undefined)
    : undefined
  const where = and(
    operationTeamOwned(operation.id),
    isNotNull(schema.teamMembers.crewStatus),
    query.status ? eq(schema.teamMembers.crewStatus, query.status) : undefined,
    query.team ? eq(schema.teamMembers.teamId, query.team) : undefined,
    query.previous === 'true' ? previous : query.previous === 'false' ? not(previous) : undefined,
    scope.teamIds ? inArray(schema.teamMembers.teamId, scope.teamIds) : undefined,
    search,
  )
  const previousFlag = sql<number>`case when ${previous} then 1 else 0 end`
  const [rows, [totals]] = await Promise.all([
    db.select({
      member: schema.teamMembers,
      team: { id: schema.teams.id, name: schema.teams.name, ownerId: schema.teams.ownerId },
      user: { name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar, phone: schema.users.phone },
      previous: previousFlag,
    }).from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .leftJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
      .where(where)
      .orderBy(...orderByQuery({
        appliedAt: schema.teamMembers.appliedAt,
        name: schema.users.name,
        crewStatus: schema.teamMembers.crewStatus,
        role: schema.teamMembers.role,
        previousCrew: previousFlag,
        waitlistPosition: schema.teamMembers.waitlistPosition,
      }, query, { tiebreaker: schema.teamMembers.id }))
      .limit(pageRange(query).limit).offset(pageRange(query).offset),
    db.select({ total: count() }).from(schema.teamMembers)
      .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
      .leftJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
      .where(where),
  ])
  return paginate({
    items: rows.map(row => toCrewMemberDto({ member: row.member, team: row.team, user: row.user, previous: Number(row.previous) === 1, pii: scope.pii })),
    total: Number(totals?.total ?? 0),
    query,
  })
}
