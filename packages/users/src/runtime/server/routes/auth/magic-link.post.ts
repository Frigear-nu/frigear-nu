import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
  // Only used when the address is unknown and `magicLink.signUp` creates the account.
  name: z.string().trim().min(1).max(120).optional(),
  redirect: z.string().optional(),
})

// Always answers the same way, whether or not the address is registered, so it can't be used to enumerate accounts.
export default defineEventHandler(async (event) => {
  const { email, name, redirect } = await readValidatedBody(event, bodySchema.parse)
  const signUp = useRuntimeConfig(event).users?.magicLinkSignUp === true

  let user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })
  let created = false

  if (!user && signUp) {
    const [inserted] = await db.insert(schema.users).values({ name: name ?? email.split('@')[0]!, email }).returning()
    user = inserted
    created = true
  }

  if (user) {
    const link = await createMagicLink(event, { userId: user.id, redirectUrl: redirect })
    if (link) {
      await dispatchAuthEmail(created ? 'verify-email' : 'magic-link', user.email, { name: user.name, url: link.url })
    }
  }

  return { ok: true }
})
