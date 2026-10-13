import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
})

export default defineEventHandler(async (event) => {
  const { name, email, password } = await readValidatedBody(event, bodySchema.parse)
  const users = useAuthUserStore()

  if (await users.findByEmail(email)) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
  }

  const user = await users.create({ name, email, password: await hashPassword(password) })

  if (useRuntimeConfig(event).public.authentication?.verifyEmail) {
    // No session until the address is verified; following the emailed link signs the user in.
    await sendVerificationLink(event, user)
    return { id: user.id, verificationRequired: true }
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { id: user.id, verificationRequired: false }
})
