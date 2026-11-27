import { z } from 'zod'
import { conflict, created } from '@frigear-nu/module-kit/server'
import { AUTH_REGISTER_EXTRAS_MAX_BYTES, AUTH_REGISTER_EXTRAS_MAX_KEYS } from '../../../utils/register-extras'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  // What the registration form's widgets (`auth.register`) add, keyed by module name. Auth only caps it; each module
  // checks its own entry in its `auth:user:created` listener.
  extras: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, 'Key extras by module name.'), z.unknown())
    .refine(value => Object.keys(value).length <= AUTH_REGISTER_EXTRAS_MAX_KEYS, `At most ${AUTH_REGISTER_EXTRAS_MAX_KEYS} modules can add extras.`)
    .refine(value => JSON.stringify(value).length <= AUTH_REGISTER_EXTRAS_MAX_BYTES, 'The extras are too large.')
    .optional(),
  // Where the verification link lands (the sign-up page's `?redirect=`); anything but a path on this site is ignored.
  redirect: z.string().max(2048).optional(),
})

// `POST /api/auth/register`: creates an account (201). Signs in at once unless `verifyEmail` is on. Fires
// `auth:user:created` (`source: 'password'`) with the form's `extras`.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  await enforceAuthRateLimit(event, 'register')
  const { name, email, password, redirect, extras } = await readValidatedBody(event, bodySchema.parse)
  const users = useAuthUserStore()

  if (await users.findByEmail(email)) {
    throw conflict('A user with this email already exists.')
  }

  const user = await users.create({ name, email, password: await hashPassword(password) })
  await notifyAuthUserCreated({ event, user, source: 'password', extras: extras ?? {} })

  if (useRuntimeConfig(event).public.authentication?.verifyEmail) {
    // No session until the address is verified; following the emailed link signs the user in.
    await sendVerificationLink(event, user, { redirect })
    return created(event, { id: user.id, verificationRequired: true })
  }

  await startAuthSession(event, user)

  return created(event, { id: user.id, verificationRequired: false })
})
