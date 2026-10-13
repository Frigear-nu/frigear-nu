import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1),
  avatar: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { name, avatar } = await readValidatedBody(event, bodySchema.parse)

  const [updated] = await db.update(schema.users)
    .set({ name, avatar })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(updated) })

  return { id: updated.id }
})
