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
  const user = await requireUser(event, { sessionOnly: true })
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

  // A failing mail must not undo a password change that already happened.
  await dispatchEmailNotification(buildPasswordChangedNotification({ to: updated.email, name: updated.name }))
    .catch(error => console.error('[@frigear-nu/users] Could not send the password changed notice.', error))

  return { id: updated.id }
})
