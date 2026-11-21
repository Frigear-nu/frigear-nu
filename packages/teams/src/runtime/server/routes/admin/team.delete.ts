import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'

// Deletes a team with its memberships and the mapping rules for it. Sub-teams stay, without a parent. No
// `teams:member:removed` hooks fire for the memberships that go with it.
export default defineEventHandler(async (event) => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getTeamOr404(id)
  await authorize(event, teamsAccess.permissions.manage, existing)
  await deleteTeamRow(existing.id)
  return noContent(event)
})
