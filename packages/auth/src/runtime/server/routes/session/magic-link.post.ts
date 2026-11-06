import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Only used when the address is unknown and `magicLink.signUp` creates the account.
  name: z.string().trim().min(1).max(120).optional(),
  redirect: z.string().optional(),
})

// `POST /api/auth/magic-link`: emails a sign-in link. Always answers the same way, whether or not the address is registered, so it can't be used to enumerate accounts.
export default defineEventHandler(async (event) => {
  const { email, name, redirect } = await readValidatedBody(event, bodySchema.parse)
  const signUp = useRuntimeConfig(event).authentication?.magicLinkSignUp === true
  const users = useAuthUserStore()

  let user = await users.findByEmail(email)
  let created = false

  if (!user && signUp) {
    user = await users.create({ name: name ?? email.split('@')[0]!, email })
    created = true
  }

  if (user) {
    const link = await createMagicLink(event, { userId: user.id, redirectUrl: redirect, purpose: created ? 'verify' : 'sign-in' })
    if (link) {
      await dispatchAuthEmail(created ? 'verify-email' : 'magic-link', user.email, { name: user.name, url: link.url })
    }
  }

  return { ok: true }
})
