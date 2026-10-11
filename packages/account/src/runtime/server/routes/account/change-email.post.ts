import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: z.string().email(),
})

const VERIFY_TTL_HOURS = 24

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { email } = await readValidatedBody(event, bodySchema.parse)

  const existing = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

  if (existing && existing.id !== user.id) {
    throw createError({ statusCode: 409, statusMessage: 'A user with this email already exists.' })
  }

  // The new address only takes effect once its owner confirms it (see verify-change-email).
  if (useRuntimeConfig(event).account?.verifyEmailChange) {
    const code = createPasswordResetCode()
    await db.insert(schema.accountEmailChanges).values({
      userId: user.id,
      oldEmail: user.email,
      newEmail: email,
      code,
      revertCode: createPasswordResetCode(),
      expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000),
    })

    const url = new URL(`/auth/verify-email-change?code=${code}`, getRequestURL(event).origin).toString()
    await dispatchEmailNotification(buildVerifyEmailChangeNotification({ to: email, name: user.name, url }))

    return { id: user.id, verificationRequired: true }
  }

  const [updated] = await db.update(schema.users)
    .set({ email })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  }

  await setUserSession(event, { user: mapUserToSession(updated) })

  return { id: updated.id, verificationRequired: false }
})
