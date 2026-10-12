import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  colorMode: z.enum(['light', 'dark', 'system']),
})

// The user's preferred color mode. Stored on the user so it follows them to the apps they sign in to
// (see `plugins/oauth-claims.ts`).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { colorMode } = await readValidatedBody(event, bodySchema.parse)

  const [updated] = await db.update(schema.users)
    .set({ colorMode })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(updated) })

  return { colorMode }
})
