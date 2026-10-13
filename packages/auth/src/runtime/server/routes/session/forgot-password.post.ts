import { db, schema } from '@nuxthub/db'

import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
})

const RESET_CODE_TTL_MINUTES = 30

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

  await db.insert(schema.passwordResets).values({ userId: user.id, code, expiresAt })

  const resetUrl = new URL(`/reset-password?code=${code}`, getRequestURL(event).origin).toString()

  await dispatchPasswordResetEmail({ to: user.email, resetUrl })

  return { ok: true }
})
