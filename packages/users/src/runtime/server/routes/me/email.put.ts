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
  const { id } = await requireUser(event, { sessionOnly: true })
  const { email } = await readValidatedBody(event, bodySchema.parse)

  // The stored row, not the session's user: the address being replaced is the one in the database.
  const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id as number) })
  if (!user) throw notFound('User not found.')

  await assertEmailAvailable(email, { exceptUserId: user.id })

  // The new address only takes effect once its owner confirms it (see verify-email-change).
  if (useRuntimeConfig(event).users?.verifyEmailChange) {
    const code = createOneTimeCode()
    // Built before the change is stored: without a configured site URL nothing is stored.
    const url = authSiteUrl(event, `/auth/verify-email-change?code=${code}`)
    await db.insert(schema.accountEmailChanges).values({
      userId: user.id,
      oldEmail: user.email,
      newEmail: email,
      code,
      revertCode: createOneTimeCode(),
      expiresAt: new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000),
    })

    await dispatchEmailNotification(buildVerifyEmailChangeNotification({ to: email, name: user.name, url }))

    // The address is unchanged until confirmed.
    return { ...toProfileDto(user), verificationRequired: true }
  }

  const [updated] = await db.update(schema.users)
    .set({ email })
    .where(eq(schema.users.id, user.id))
    .returning()

  if (!updated) throw notFound('User not found.')

  // Reset codes and sign-in links went to the old address.
  await deleteUnusedAuthEmailCodes(updated.id)
  await notifyAuthCredentialsChanged({ userId: updated.id, reason: 'email', event })
  await setUserSession(event, { user: mapUserToSession(updated) })

  return { ...toProfileDto(updated), verificationRequired: false }
})
