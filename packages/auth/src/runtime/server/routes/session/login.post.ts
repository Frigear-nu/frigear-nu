import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  const users = useAuthUserStore()

  const user = await users.findByEmail(email)

  if (!user?.password || !(await verifyPassword(user.password, password))) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password.' })
  }

  if (useRuntimeConfig(event).public.authentication?.verifyEmail && !user.emailVerifiedAt) {
    throw createError({ statusCode: 403, statusMessage: 'Please verify your email address before logging in.' })
  }

  const updated = await users.update(user.id, { lastLoginAt: new Date() })

  await setUserSession(event, { user: mapUserToSession(updated ?? user) })

  return { id: user.id }
})
