import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm'
import { conflict, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { CrewRuntimeConfig, CrewSettingsDto } from '../../../types'
import { newId } from '../../utils'
import { toCrewSettingsDto } from './crew-dto'
import type { crewSettingsInput } from './crew-schemas'

type TeamRoleMatchLike = { role: string } | { plan: string }

export type CrewSettingsRow = typeof schema.crewSettings.$inferSelect
export type CrewTeamRow = typeof schema.teams.$inferSelect
type CrewSettingsInput = z.output<typeof crewSettingsInput>

/** The crew settings of an operation, or `undefined` before the first save. */
export async function findCrewSettings(operationId: string): Promise<CrewSettingsRow | undefined> {
  const [row] = await db.select().from(schema.crewSettings).where(eq(schema.crewSettings.operationId, operationId)).limit(1)
  return row
}

/** The crew settings (stored row or defaults) as the staff API answers them. */
export async function crewSettingsDtoOf(operationId: string): Promise<CrewSettingsDto> {
  const [row, approved] = await Promise.all([findCrewSettings(operationId), crewApprovedCount(operationId)])
  return toCrewSettingsDto(operationId, row, approved)
}

/** How many people of an operation's crew are approved: what the capacity counts. */
export async function crewApprovedCount(operationId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId), eq(schema.teamMembers.crewStatus, 'approved')))
  return Number(row?.total ?? 0)
}

/** The teams an operation owns, in the order staff set. */
export function crewOperationTeams(operationId: string): Promise<CrewTeamRow[]> {
  return db.select().from(schema.teams)
    .where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId)))
    .orderBy(asc(schema.teams.sort), asc(schema.teams.createdAt), asc(schema.teams.id))
}

/** The team of an operation with this id, or `undefined` (a team of another owner counts as missing). */
export async function findCrewOperationTeam(operationId: string, teamId: string): Promise<CrewTeamRow | undefined> {
  const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId)).limit(1)
  return row && row.ownerType === 'operation' && row.ownerId === operationId ? row : undefined
}

/** The team of an operation with this id, or a 400 on `field`. */
export async function getCrewOperationTeamOr400(operationId: string, teamId: string, field = 'teamId'): Promise<CrewTeamRow> {
  const team = await findCrewOperationTeam(operationId, teamId)
  if (!team) throw validationError([{ path: [field], message: 'The team must belong to this operation.' }], 'Unknown team')
  return team
}

/**
 * The team applications land in: `preferredId` when it is a team of the operation, else the operation's first team,
 * else a new "Crew" team of the `bar` kind (so a fresh operation can take applications at once).
 */
export async function crewEnsureDefaultTeam(event: H3Event, operationId: string, preferredId?: string | null): Promise<CrewTeamRow> {
  if (preferredId) return getCrewOperationTeamOr400(operationId, preferredId, 'defaultTeamId')
  const [first] = await crewOperationTeams(operationId)
  if (first) return first
  return createTeamRow(event, { ownerType: 'operation', ownerId: operationId, kind: 'bar', name: { en: 'Crew', da: 'Crew' } })
}

/** The team applications of an operation land in: its stored default, or the first team, or a new "Crew" team. */
export async function crewDefaultTeamOf(event: H3Event, operationId: string, settings: CrewSettingsRow | undefined): Promise<CrewTeamRow> {
  const stored = settings?.defaultTeamId ? await findCrewOperationTeam(operationId, settings.defaultTeamId) : undefined
  return stored ?? crewEnsureDefaultTeam(event, operationId)
}

/** The lowest role of the ladder of a team kind: what an applicant holds (without a grant) until approved. */
export async function crewLowestRole(event: H3Event, kind: string): Promise<string> {
  const ladder = await getTeamLadderOr400(event, kind)
  return ladder.roles[0]!.key
}

type Preset = { match: TeamRoleMatchLike, teamRole: string }

/**
 * Adds the role mapping presets of an operation as owner-wide `team_role_mappings` rows: a global `barmanager` is a BA,
 * a global `crew` is a bartender, and (with the module option `memberPlan`) an active subscription to that plan is a
 * volunteer. A preset that exists already, or whose role is on no ladder, is skipped, so it is safe to call again.
 */
export async function crewEnsurePresets(event: H3Event, operationId: string): Promise<void> {
  const memberPlan = (useRuntimeConfig(event).crew as CrewRuntimeConfig | undefined)?.memberPlan
  const presets: Preset[] = [
    { match: { role: 'barmanager' }, teamRole: 'ba' },
    { match: { role: 'crew' }, teamRole: 'bartender' },
    ...(memberPlan ? [{ match: { plan: memberPlan }, teamRole: 'volunteer' }] : []),
  ]
  const owner = { ownerType: 'operation', ownerId: operationId }
  const existing = await db.select().from(schema.teamRoleMappings)
    .where(and(eq(schema.teamRoleMappings.ownerType, owner.ownerType), eq(schema.teamRoleMappings.ownerId, operationId), isNull(schema.teamRoleMappings.teamId)))
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  for (const preset of presets) {
    const match = normalizeTeamRoleMatch(preset.match)
    if (existing.some(row => same(normalizeTeamRoleMatch(row.match as TeamRoleMatchLike), match) && row.teamRole === preset.teamRole)) continue
    try {
      await assertTeamMappingTarget(event, { ...owner, teamId: null, teamRole: preset.teamRole })
    }
    catch {
      // The role is on no ladder of this host: there is nothing to map to.
      continue
    }
    await db.insert(schema.teamRoleMappings).values({ id: newId('trm'), ...owner, teamId: null, match, teamRole: preset.teamRole, priority: 0 })
  }
  forgetTeamRoles(event)
}

/**
 * 400 unless `formId` is a form people can apply with: it exists, asks for a signed-in user (`access.auth: 'user'`, so
 * a submission carries the user id) and stores its submissions. 409 when another operation recruits with it.
 */
export async function assertCrewForm(formId: string, operationId: string): Promise<void> {
  const [form] = await db.select().from(schema.forms).where(eq(schema.forms.id, formId)).limit(1)
  if (!form) throw validationError([{ path: ['formId'], message: 'This form does not exist.' }], 'Unknown form')
  if ((form.definition.access?.auth ?? 'none') !== 'user') {
    throw validationError([{ path: ['formId'], message: 'The form must require a signed-in user (access: user).' }], 'Unsuitable form')
  }
  if (form.definition.storage === 'none') {
    throw validationError([{ path: ['formId'], message: 'The form must store its submissions.' }], 'Unsuitable form')
  }
  const [other] = await db.select({ operationId: schema.crewSettings.operationId }).from(schema.crewSettings)
    .where(and(eq(schema.crewSettings.formId, formId), ne(schema.crewSettings.operationId, operationId))).limit(1)
  if (other) throw conflict('Another operation recruits with this form already.', { field: 'formId' })
}

/** Saves the settings of an operation (the whole record), creating the default team and the presets on the way. */
export async function saveCrewSettings(event: H3Event, operationId: string, input: CrewSettingsInput): Promise<CrewSettingsRow> {
  if (input.formId) await assertCrewForm(input.formId, operationId)
  const team = await crewEnsureDefaultTeam(event, operationId, input.defaultTeamId)
  const values = {
    formId: input.formId ?? null,
    defaultTeamId: team.id,
    capacity: input.capacity ?? null,
    waitlist: input.waitlist,
    previousCrewFirst: input.previousCrewFirst,
    opensAt: input.opensAt ?? null,
    closesAt: input.closesAt ?? null,
    statusEmails: input.statusEmails ?? null,
    presets: input.presets,
  }
  const [row] = await db.insert(schema.crewSettings).values({ operationId, ...values })
    .onConflictDoUpdate({ target: schema.crewSettings.operationId, set: { ...values, updatedAt: new Date() } })
    .returning()
  if (input.presets) await crewEnsurePresets(event, operationId)
  return row!
}
