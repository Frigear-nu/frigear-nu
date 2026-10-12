import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  colorMode: z.enum(['light', 'dark', 'system']),
})

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
