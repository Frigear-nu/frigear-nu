import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { emailField } from '../../schemas'

const bodySchema = z.object({
  email: emailField(),
})

const VERIFY_TTL_HOURS = 24

export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { email } = await readValidatedBody(event, bodySchema.parse)

  await assertEmailAvailable(email, { exceptUserId: user.id as number })

  // The new address only takes effect once its owner confirms it (see verify-email-change).
  if (useRuntimeConfig(event).users?.verifyEmailChange) {
    const code = createOneTimeCode()
    await db.insert(schema.accountEmailChanges).values({
      userId: user.id,
      oldEmail: user.email,
      newEmail: email,
      code,
      revertCode: createOneTimeCode(),
      expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000),
    })

    const url = new URL(`/auth/verify-email-change?code=${code}`, getRequestURL(event).origin).toString()
    await dispatchEmailNotification(buildVerifyEmailChangeNotification({ to: email, name: user.name, url }))

    // The address is unchanged until confirmed; answer the stored row, not the session snapshot.
    const current = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, user.id as number) })
    if (!current) throw notFound('User not found.')
    return { ...toProfileDto(current), verificationRequired: true }
  }

  const [updated] = await db.update(schema.users)
    .set({ email })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) throw notFound('User not found.')

  await notifyAuthCredentialsChanged({ userId: updated.id, reason: 'email', event })
  await setUserSession(event, { user: mapUserToSession(updated) })

  return { ...toProfileDto(updated), verificationRequired: false }
})
