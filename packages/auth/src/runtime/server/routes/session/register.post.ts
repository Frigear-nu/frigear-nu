import { z } from 'zod'
import { conflict, created } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
})

// `POST /api/auth/register`: creates an account (201). Signs in at once unless `verifyEmail` is on.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  await enforceAuthRateLimit(event, 'register')
  const { name, email, password } = await readValidatedBody(event, bodySchema.parse)
  const users = useAuthUserStore()

  if (await users.findByEmail(email)) {
    throw conflict('A user with this email already exists.')
  }

  const user = await users.create({ name, email, password: await hashPassword(password) })

  if (useRuntimeConfig(event).public.authentication?.verifyEmail) {
    // No session until the address is verified; following the emailed link signs the user in.
    await sendVerificationLink(event, user)
    return created(event, { id: user.id, verificationRequired: true })
  }

  await startAuthSession(event, user)

  return created(event, { id: user.id, verificationRequired: false })
})
