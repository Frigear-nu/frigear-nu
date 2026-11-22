import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'

// Test-only: sets the locale a member's emails go out in (crew's `team_members.locale`, normally set by an application).
export default defineEventHandler(async (event) => {
  const { userId, teamId, locale } = await readBody<{ userId: number, teamId: string, locale: string | null }>(event)
  await db.update(schema.teamMembers).set({ locale }).where(and(eq(schema.teamMembers.userId, userId), eq(schema.teamMembers.teamId, teamId)))
  return { ok: true }
})
