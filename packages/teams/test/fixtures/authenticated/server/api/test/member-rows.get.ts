import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Test-only: the stored membership and rule rows of `?teamId=`, to check the foreign key cascades.
export default defineEventHandler(async (event) => {
  const { teamId = '' } = getQuery(event) as { teamId?: string }
  const members = await db.select().from(schema.teamMembers).where(eq(schema.teamMembers.teamId, teamId))
  const rules = await db.select().from(schema.teamRoleMappings).where(eq(schema.teamRoleMappings.teamId, teamId))
  return { members: members.length, rules: rules.length }
})
