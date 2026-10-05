import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull } from 'drizzle-orm'

import { z } from 'zod'

const bodySchema = z.object({
  code: z.string().min(1),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})

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
    throw createError({ statusCode: 400, statusMessage: 'This password reset link is invalid or has expired.' })
  }

  const hashed = await hashPassword(password)
  const [user] = await db.update(schema.users)
    .set({ password: hashed })
    .where(eq(schema.users.id, passwordReset.userId))
    .returning()

  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { id: user.id }
})
