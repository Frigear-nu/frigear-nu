import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)

  const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (!user?.password || !(await verifyPassword(user.password, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  if (useRuntimeConfig(event).public.users?.verifyEmail && !user.emailVerifiedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Please verify your email address before logging in.' })
  }

  const [updated] = await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id)).returning()

  await setUserSession(event, { user: mapUserToSession(updated ?? user) })

  return { id: user.id }
})
