import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

// Test-only: sets the user's own language (`users.locale` of `@frigear-nu/users`, normally chosen on the profile page).
export default defineEventHandler(async (event) => {
  const { userId, locale } = await readValidatedBody(event, z.object({ userId: z.number(), locale: z.string().nullable() }).parse)
  await db.update(schema.users).set({ locale }).where(eq(schema.users.id, userId))
  return { ok: true }
})
