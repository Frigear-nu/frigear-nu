import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (existing && existing.id !== user.id) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
  }

  const [updated] = await db.update(schema.users)
    .set({ email })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(updated) })

  return { id: updated.id }
})
