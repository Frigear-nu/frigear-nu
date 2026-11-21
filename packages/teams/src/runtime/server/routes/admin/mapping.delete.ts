import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { teamsAccess } from '../../../access'

// Deletes a rule: the roles it mapped are gone on the next request (nothing was stored per user).
export default defineEventHandler(async (event) => {
  await authorize(event, teamsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getTeamMappingOr404(id)
  await db.delete(schema.teamRoleMappings).where(eq(schema.teamRoleMappings.id, existing.id))
  return noContent(event)
})
