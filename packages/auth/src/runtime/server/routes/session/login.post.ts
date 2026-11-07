import { z } from 'zod'
import { apiError } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

// `POST /api/auth/login`: signs in with email and password.
export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  const users = useAuthUserStore()

  const user = await users.findByEmail(email)

  if (!user?.password || !(await verifyPassword(user.password, password))) {
    throw apiError(401, 'invalid_credentials', 'Invalid email or password.')
  }

  if (useRuntimeConfig(event).public.authentication?.verifyEmail && !user.emailVerifiedAt) {
    throw apiError(403, 'email_not_verified', 'Please verify your email address before logging in.')
  }

  const updated = await users.update(user.id, { lastLoginAt: new Date() })

  await replaceUserSession(event, { user: mapUserToSession(updated ?? user) })

  return { id: user.id }
})
