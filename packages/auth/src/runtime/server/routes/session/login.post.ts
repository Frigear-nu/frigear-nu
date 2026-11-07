import { z } from 'zod'
import { apiError } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
})

// Checked against for an unknown or password-less account, so the answer takes as long as a wrong password.
let dummyHash: Promise<string> | undefined
const dummyPasswordHash = () => dummyHash ??= hashPassword(createOneTimeCode())

// `POST /api/auth/login`: signs in with email and password. Failed attempts are throttled per client and account.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  await assertAuthLoginAttemptsLeft(event, email)
  const users = useAuthUserStore()

  const user = await users.findByEmail(email)
  const valid = user?.password
    ? await verifyPassword(user.password, password)
    : (await verifyPassword(await dummyPasswordHash(), password), false)

  if (!user || !valid) {
    await recordAuthLoginFailure(event, email)
    throw apiError(401, 'invalid_credentials', 'Invalid email or password.')
  }

  if (useRuntimeConfig(event).public.authentication?.verifyEmail && !user.emailVerifiedAt) {
    throw apiError(403, 'email_not_verified', 'Please verify your email address before logging in.')
  }

  const updated = await users.update(user.id, { lastLoginAt: new Date() })

  await replaceUserSession(event, { user: mapUserToSession(updated ?? user) })

  return { id: user.id }
})
