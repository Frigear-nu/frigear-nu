import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { teamsAccess } from '../../../access'
import type { TeamMemberDto } from '../../../../types'

// Changes a member's role (a role of the team kind's ladder) and/or status. The hooks follow the grant, not the row:
// - a status change that ends the grant (`null` / `active` -> anything else) fires `teams:member:removed`;
// - a status change that starts it (anything else -> `null` / `active`) fires `teams:member:added`;
// - a role change while the membership grants (before and after) fires `teams:member:role-changed`.
// A role change on a membership that does not grant fires nothing: the new role arrives with `added` later.
export default defineEventHandler(async (event): Promise<TeamMemberDto> => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id, userId } = await getValidatedRouterParams(event, teamMemberParams.parse)
  const patch = await readValidatedBody(event, teamMemberPatchSchema.parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, team)
  const existing = await getTeamMemberOr404(team.id, userId)
  if (patch.role !== undefined) await assertTeamRoleOnLadder(event, team.kind, patch.role)

  const values: Partial<typeof schema.teamMembers.$inferInsert> = {}
  if (patch.role !== undefined && patch.role !== existing.role) values.role = patch.role
  if (patch.status !== undefined && (patch.status ?? null) !== (existing.status ?? null)) values.status = patch.status ?? null
  const row = Object.keys(values).length
    ? (await db.update(schema.teamMembers).set(values).where(eq(schema.teamMembers.id, existing.id)).returning())[0]!
    : existing
  forgetTeamRoles(event)

  const member = await teamMemberDtoOf(row, true)
  const granted = teamMemberStatusGrants(existing.status)
  const grants = teamMemberStatusGrants(row.status)
  const hooks = useNitroApp().hooks
  if (granted && !grants) {
    await hooks.callHook('teams:member:removed', { event, team: await toAdminTeamDtoOf(event, team), member })
  }
  else if (!granted && grants) {
    await hooks.callHook('teams:member:added', { event, team: await toAdminTeamDtoOf(event, team), member })
  }
  else if (granted && grants && values.role) {
    await hooks.callHook('teams:member:role-changed', { event, team: await toAdminTeamDtoOf(event, team), member, from: existing.role, to: row.role })
  }
  return await allows(event, teamsAccess.permissions.pii) ? member : withoutTeamsEmail(member)
})
