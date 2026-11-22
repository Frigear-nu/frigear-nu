import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'

// Test-only: changes a membership's status in the database, without teams' routes and so without their hooks, the way a
// grant can stop granting with no hook fired (`teams:member:removed` is what normally cancels the person's shifts).
export default defineEventHandler(async (event) => {
  const { teamId, userId, status } = await readBody<{ teamId: string, userId: number, status: string | null }>(event)
  await db.update(schema.teamMembers).set({ status }).where(and(eq(schema.teamMembers.teamId, teamId), eq(schema.teamMembers.userId, userId)))
  return { ok: true }
})
