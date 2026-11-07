import { db, schema } from '@nuxthub/db'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

const RESET_CODE_TTL_MINUTES = 30

// `POST /api/auth/forgot-password`: emails a reset link to a registered address.
// TODO(owner): no cooldown per address or client yet (unlike magic links); decide on throttling.
export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const user = await useAuthUserStore().findByEmail(email)

  // Always respond the same way whether or not the email is registered, so this endpoint can't
  // be used to enumerate accounts.
  if (!user) {
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
