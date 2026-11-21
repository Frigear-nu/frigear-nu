import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { noContent } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'

// Removes an explicit membership. Fires `teams:member:removed` when it granted its role (a pending row never fired
// `added`, so it fires nothing). A mapping rule may still give the user a role on
// the team: change the rule for that.
export default defineEventHandler(async (event) => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id, userId } = await getValidatedRouterParams(event, teamMemberParams.parse)
  const team = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, team)
  const existing = await getTeamMemberOr404(team.id, userId)
  const member = await teamMemberDtoOf(existing, true)
  await db.delete(schema.teamMembers).where(eq(schema.teamMembers.id, existing.id))
  forgetTeamRoles(event)
  if (teamMemberStatusGrants(existing.status)) {
    await useNitroApp().hooks.callHook('teams:member:removed', { event, team: await toAdminTeamDtoOf(event, team), member })
  }
  return noContent(event)
})
