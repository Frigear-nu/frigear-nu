import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { apiError, notFound } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({
  code: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})

// `POST /api/auth/reset-password`: sets a new password with an emailed code and signs in.
export default defineEventHandler(async (event) => {
  const { code, password } = await readValidatedBody(event, bodySchema.parse)

  const [passwordReset] = await db.update(schema.passwordResets)
    .set({ usedAt: new Date() })
    .where(and(
      eq(schema.passwordResets.code, code),
      isNull(schema.passwordResets.usedAt),
      gt(schema.passwordResets.expiresAt, new Date()),
    ))
    .returning()

  if (!passwordReset) {
    throw apiError(400, 'invalid_link', 'This password reset link is invalid or has expired.')
  }

  const user = await useAuthUserStore().update(passwordReset.userId, { password: await hashPassword(password) })

  if (!user) {
    throw notFound('User not found.')
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { id: user.id }
})
