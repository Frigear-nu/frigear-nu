import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

const RESET_CODE_TTL_MINUTES = 30

// `POST /api/auth/forgot-password`: emails a reset link to a registered address. Throttled per client
// (`rateLimit.requests`), and a link asked for again within the cooldown (`passwordReset.cooldown`) is not re-sent, so
// the route can't be used to flood an inbox.
export default defineEventHandler(async (event) => {
  await enforceAuthRateLimit(event, 'forgot-password')
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const user = await useAuthUserStore().findByEmail(email)

  // Always respond the same way whether or not the email is registered, so this endpoint can't
  // be used to enumerate accounts.
  if (!user) {
    return { ok: true }
  }

  const cooldownSeconds = useRuntimeConfig(event).authentication?.passwordResetCooldown ?? 60
  const [latest] = await db.select({ createdAt: schema.passwordResets.createdAt })
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.userId, user.id))
    .orderBy(desc(schema.passwordResets.createdAt))
    .limit(1)
  if (latest && Date.now() - latest.createdAt.getTime() < cooldownSeconds * 1000) {
    return { ok: true }
  }

  const code = createOneTimeCode()
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000)
  // Built before the code is stored: without a site URL nothing is stored.
  const resetUrl = authSiteUrl(event, `/reset-password?code=${code}`)

  await db.insert(schema.passwordResets).values({ userId: user.id, code, expiresAt })

  await dispatchPasswordResetEmail({ to: user.email, resetUrl })

  return { ok: true }
})
