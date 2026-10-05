import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmNewPassword: z.string().min(8),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match.',
  path: ['confirmNewPassword'],
})

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { currentPassword, newPassword } = await readValidatedBody(event, bodySchema.parse)

  const dbUser = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, user.id) })

  if (!dbUser?.password || !(await verifyPassword(dbUser.password, currentPassword))) {
    throw createError({ statusCode: 401, statusMessage: 'Your current password is incorrect.' })
  }

  const hashed = await hashPassword(newPassword)

  const [updated] = await db.update(schema.users)
    .set({ password: hashed })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(updated) })

  return { id: updated.id }
})
