import { db, schema } from '@nuxthub/db'
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { apiError } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'
import type { TeamLadderDto } from '../../../../types'

// Replaces the ladder of a team kind (a new kind starts its ladder). A role cannot be removed while a member of a team
// of this kind holds it, a rule for one such team maps to it, or a rule for every team of an owner that has a team of
// this kind maps to it: `409 team_role_in_use`, with the roles in `data.roles`.
export default defineEventHandler(async (event): Promise<TeamLadderDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { kind } = await getValidatedRouterParams(event, teamLadderParams.parse)
  const input = await readValidatedBody(event, teamLadderInput.parse)
  const keys = input.roles.map(role => role.key)

  const held = await db.selectDistinct({ role: schema.teamMembers.role }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teamMembers.teamId, schema.teams.id))
    .where(and(eq(schema.teams.kind, kind), notInArray(schema.teamMembers.role, keys)))
  const kindTeams = db.select({ id: schema.teams.id }).from(schema.teams).where(eq(schema.teams.kind, kind))
  const mapped = await db.selectDistinct({ role: schema.teamRoleMappings.teamRole }).from(schema.teamRoleMappings)
    .where(and(inArray(schema.teamRoleMappings.teamId, kindTeams), notInArray(schema.teamRoleMappings.teamRole, keys)))
  // Rules for every team of an owner give the role on this kind's teams of that owner while it is on the ladder.
  const current = (await loadTeamLadders(event))[kind]?.roles.map(role => role.key) ?? []
  const removed = current.filter(key => !keys.includes(key))
  const ownerWide = removed.length
    ? await db.select({ role: schema.teamRoleMappings.teamRole, ownerType: schema.teamRoleMappings.ownerType, ownerId: schema.teamRoleMappings.ownerId })
        .from(schema.teamRoleMappings).where(and(isNull(schema.teamRoleMappings.teamId), inArray(schema.teamRoleMappings.teamRole, removed)))
    : []
  const ownersOfKind = ownerWide.length
    ? new Set((await db.selectDistinct({ ownerType: schema.teams.ownerType, ownerId: schema.teams.ownerId }).from(schema.teams).where(eq(schema.teams.kind, kind)))
        .map(owner => teamsOwnerKey({ ownerType: owner.ownerType, ownerId: owner.ownerId ?? null })))
    : new Set<string>()
  const ownerWideInUse = ownerWide.filter(rule => ownersOfKind.has(teamsOwnerKey({ ownerType: rule.ownerType, ownerId: rule.ownerId ?? null })))
  const inUse = [...new Set([...held, ...mapped, ...ownerWideInUse].map(row => row.role))].sort()
  if (inUse.length) {
    throw apiError(409, 'team_role_in_use', `These roles are still in use: ${inUse.join(', ')}.`, { roles: inUse })
  }

  const values = { roles: input.roles, leadFrom: input.leadFrom ?? null }
  await db.insert(schema.teamRoleLadders).values({ kind, ...values })
    .onConflictDoUpdate({ target: schema.teamRoleLadders.kind, set: { ...values, updatedAt: new Date() } })
  forgetTeamLadders(event)
  forgetTeamRoles(event)
  return { kind, ...values, source: 'stored' }
})
