import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray } from 'drizzle-orm'
import { resolveOwner } from '@frigear-nu/audience/server'
import { conflict, notFound, validationError } from '@frigear-nu/module-kit/server'
import type { z } from 'zod'
import type { AdminTeamDto, TeamMemberDto, TeamOwner, Translated } from '../../../types'
import { newId } from '../../utils'
import { sameTeamOwner } from '../../utils/resolve'
import { toAdminTeamDto, toTeamMemberDto } from './teams-dto'
import { isTeamsUniqueViolation } from './teams-errors'
import { getTeamLadderOr400 } from './teams-ladders'
import type { teamInput, teamPatchSchema } from './teams-schemas'

export type TeamRow = typeof schema.teams.$inferSelect
export type TeamMemberRow = typeof schema.teamMembers.$inferSelect
type TeamInput = z.output<typeof teamInput>
type TeamPatch = z.output<typeof teamPatchSchema>

/** The row with this id, or `undefined`. */
export async function findTeamById(id: string): Promise<TeamRow | undefined> {
  const [row] = await db.select().from(schema.teams).where(eq(schema.teams.id, id)).limit(1)
  return row
}

/** The row with this id, or a 404. */
export async function getTeamOr404(id: string): Promise<TeamRow> {
  const row = await findTeamById(id)
  if (!row) throw notFound('Team not found.')
  return row
}

/** The membership of `userId` on `teamId`, or `undefined`. */
export async function findTeamMember(teamId: string, userId: number): Promise<TeamMemberRow | undefined> {
  const [row] = await db.select().from(schema.teamMembers)
    .where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId))).limit(1)
  return row
}

/** The membership of `userId` on `teamId`, or a 404. */
export async function getTeamMemberOr404(teamId: string, userId: number): Promise<TeamMemberRow> {
  const row = await findTeamMember(teamId, userId)
  if (!row) throw notFound('This user is not a member of the team.')
  return row
}

/**
 * Checks an owner and returns its label: the platform has no id (`ownerId: null`), every other owner must exist
 * according to `audience:owner:resolve` (operations answers `operation`, teams answers `team`). An owner type nobody
 * answers for, or an id that does not exist, is a 400.
 */
export async function assertTeamsOwner(event: H3Event, owner: TeamOwner): Promise<Translated | null> {
  if (owner.ownerType === 'platform') {
    if (owner.ownerId) throw validationError([{ path: ['ownerId'], message: 'A platform-owned record has no owner id.' }], 'Unknown owner')
    return null
  }
  if (!owner.ownerId) throw validationError([{ path: ['ownerId'], message: 'Choose the owner.' }], 'Unknown owner')
  const resolved = await resolveOwner(event, { type: owner.ownerType, id: owner.ownerId }, { hooks: useNitroApp().hooks })
  if (resolved.exists !== true) {
    throw validationError([{ path: ['ownerId'], message: resolved.exists === false ? 'This owner does not exist.' : `No installed module knows the owner type "${owner.ownerType}".` }], 'Unknown owner')
  }
  return resolved.label
}

/** The owners' labels, each owner resolved once (`null` for the platform and for owners nobody answers for). */
export async function teamsOwnerLabels(event: H3Event, owners: TeamOwner[]): Promise<Map<string, Translated | null>> {
  const labels = new Map<string, Translated | null>()
  for (const owner of owners) {
    const key = teamsOwnerKey(owner)
    if (labels.has(key)) continue
    if (owner.ownerType === 'platform' || !owner.ownerId) {
      labels.set(key, null)
      continue
    }
    const resolved = await resolveOwner(event, { type: owner.ownerType, id: owner.ownerId }, { hooks: useNitroApp().hooks })
    labels.set(key, resolved.label)
  }
  return labels
}

export const teamsOwnerKey = (owner: TeamOwner) => `${owner.ownerType}\u0000${owner.ownerId ?? ''}`

/** The number of explicit members per team. */
export async function teamMemberCounts(teamIds: string[]): Promise<Map<string, number>> {
  if (!teamIds.length) return new Map()
  const rows = await db.select({ teamId: schema.teamMembers.teamId, total: count() }).from(schema.teamMembers)
    .where(inArray(schema.teamMembers.teamId, teamIds)).groupBy(schema.teamMembers.teamId)
  return new Map(rows.map(row => [row.teamId, Number(row.total)]))
}

/** The staff DTOs of rows, with their owners' labels and member counts. */
export async function toAdminTeamDtos(event: H3Event, rows: TeamRow[]): Promise<AdminTeamDto[]> {
  const [labels, counts] = await Promise.all([
    teamsOwnerLabels(event, rows.map(row => ({ ownerType: row.ownerType, ownerId: row.ownerId ?? null }))),
    teamMemberCounts(rows.map(row => row.id)),
  ])
  return rows.map(row => toAdminTeamDto(row, {
    ownerLabel: labels.get(teamsOwnerKey({ ownerType: row.ownerType, ownerId: row.ownerId ?? null })) ?? null,
    memberCount: counts.get(row.id) ?? 0,
  }))
}

/** The staff DTO of one row. */
export async function toAdminTeamDtoOf(event: H3Event, row: TeamRow): Promise<AdminTeamDto> {
  return (await toAdminTeamDtos(event, [row]))[0]!
}

/** 400 when `parentId` names no team of the same owner (or the team itself). */
async function assertTeamParent(parentId: string | null | undefined, owner: TeamOwner, selfId?: string): Promise<void> {
  if (!parentId) return
  const parent = parentId === selfId ? undefined : await findTeamById(parentId)
  if (!parent || !sameTeamOwner({ ownerType: parent.ownerType, ownerId: parent.ownerId ?? null }, owner)) {
    throw validationError([{ path: ['parentId'], message: 'The parent must be another team of the same owner.' }], 'Unknown parent team')
  }
}

/** Inserts a team after the owner, kind and parent checks. */
export async function createTeamRow(event: H3Event, input: TeamInput): Promise<TeamRow> {
  const owner: TeamOwner = { ownerType: input.ownerType, ownerId: input.ownerId ?? null }
  await assertTeamsOwner(event, owner)
  await getTeamLadderOr400(event, input.kind)
  await assertTeamParent(input.parentId, owner)
  const [row] = await db.insert(schema.teams).values({
    id: newId('tem'),
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    parentId: input.parentId ?? null,
    kind: input.kind,
    name: input.name,
    description: input.description ?? null,
    capacity: input.capacity ?? null,
    sort: input.sort ?? 0,
  }).returning()
  return row!
}

/** Applies a partial update; returns the updated row (the stored one when nothing changed). */
export async function patchTeamRow(existing: TeamRow, patch: TeamPatch): Promise<TeamRow> {
  if (patch.parentId !== undefined) await assertTeamParent(patch.parentId, { ownerType: existing.ownerType, ownerId: existing.ownerId ?? null }, existing.id)
  const values: Partial<typeof schema.teams.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.description !== undefined) values.description = patch.description
  if (patch.parentId !== undefined) values.parentId = patch.parentId
  if (patch.capacity !== undefined) values.capacity = patch.capacity
  if (patch.sort !== undefined) values.sort = patch.sort
  if (!Object.keys(values).length) return existing
  const [row] = await db.update(schema.teams).set(values).where(eq(schema.teams.id, existing.id)).returning()
  return row!
}

/** Deletes a team: its memberships and rules go with it (foreign keys), its sub-teams lose their parent. */
export async function deleteTeamRow(id: string): Promise<void> {
  await db.update(schema.teams).set({ parentId: null }).where(eq(schema.teams.parentId, id))
  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.teamId, id))
  await db.delete(schema.teamRoleMappings).where(eq(schema.teamRoleMappings.teamId, id))
  await db.delete(schema.teams).where(eq(schema.teams.id, id))
}

/** Adds a membership; 409 when the user is a member already (the unique index decides between racing requests). */
export async function insertTeamMemberRow(values: { teamId: string, userId: number, role: string, status: string | null, addedBy: number | null }): Promise<TeamMemberRow> {
  if (await findTeamMember(values.teamId, values.userId)) throw conflict('This user is a member of the team already.', { field: 'userId' })
  const [row] = await db.insert(schema.teamMembers).values({ id: newId('tmm'), ...values }).returning().catch((error: unknown) => {
    if (isTeamsUniqueViolation(error)) throw conflict('This user is a member of the team already.', { field: 'userId' })
    throw error
  })
  return row!
}

/** The DTO of one membership row, with the user's name and avatar (and email with `pii`). */
export async function teamMemberDtoOf(row: TeamMemberRow, pii: boolean): Promise<TeamMemberDto> {
  const [user] = await db.select({ name: schema.users.name, email: schema.users.email, avatar: schema.users.avatar })
    .from(schema.users).where(eq(schema.users.id, row.userId)).limit(1)
  return toTeamMemberDto(row, user, pii)
}

/** The member without the email, for a caller without `teams:pii`. */
export function withoutTeamsEmail(member: TeamMemberDto): TeamMemberDto {
  const { email: _email, ...rest } = member
  return rest
}

/** 400 when no user has this id. */
export async function assertTeamsUserExists(userId: number, field = 'userId'): Promise<void> {
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  if (!row) throw validationError([{ path: [field], message: 'This user does not exist.' }], 'Unknown user')
}
