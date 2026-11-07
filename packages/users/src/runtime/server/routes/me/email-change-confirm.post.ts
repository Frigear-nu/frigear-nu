import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { badRequest, forbidden, notFound } from '@frigear-nu/module-kit/server'
import { EMAIL_CHANGE_INVALID, findEmailChangeByCode } from '../../email-change'

const REVERT_TTL_DAYS = 7

// The "Confirm new email" button of the `/auth/verify-email-change` page: applies the change, then tells the old
// address (with a revert link). Only the account that asked for the change can confirm it, from a browser session.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const { code } = await readValidatedBody(event, z.object({ code: z.string().min(1) }).parse)
  const now = new Date()

  const change = await findEmailChangeByCode(code)
  if (!change || change.verifiedAt || change.expiresAt <= now) {
    throw badRequest(EMAIL_CHANGE_INVALID)
  }
  if (change.userId !== user.id) {
    throw forbidden('This email change belongs to another account. Sign in as that account to confirm it.')
  }

  await assertEmailAvailable(change.newEmail, { exceptUserId: change.userId })
  // Built before anything changes: without a configured site URL this fails, and the change must not half-apply.
  const revertUrl = authSiteUrl(event, `/auth/revert-email-change?code=${change.revertCode}`)

  // Used up atomically, so two concurrent confirmations apply (and notify) once.
  const [claimed] = await db.update(schema.accountEmailChanges)
    .set({ verifiedAt: now, revertExpiresAt: new Date(now.getTime() + REVERT_TTL_DAYS * 24 * 60 * 60 * 1000) })
    .where(and(
      eq(schema.accountEmailChanges.id, change.id),
      eq(schema.accountEmailChanges.userId, user.id),
      isNull(schema.accountEmailChanges.verifiedAt),
      gt(schema.accountEmailChanges.expiresAt, now),
    ))
    .returning()

  if (!claimed) {
    throw badRequest(EMAIL_CHANGE_INVALID)
  }

  const [updated] = await db.update(schema.users)
    .set({ email: normalizeUserEmail(claimed.newEmail), emailVerifiedAt: now })
    .where(eq(schema.users.id, claimed.userId))
    .returning()

  if (!updated) throw notFound('User not found.')

  await notifyAuthCredentialsChanged({ userId: updated.id, reason: 'email', event })
  await setUserSession(event, { user: mapUserToSession(updated) })

  // The change already happened: a failing mail must not turn it into an error for the user.
  await dispatchEmailNotification(buildEmailChangedNotification({
    to: claimed.oldEmail,
    name: updated.name,
    newEmail: claimed.newEmail,
    revertUrl,
  })).catch(error => console.error('[@frigear-nu/users] Could not send the email changed notice.', error))

  const profilePath = useRuntimeConfig(event).public.users?.profilePath
  return {
    id: updated.id,
    email: updated.email,
    redirect: profilePath ? `${profilePath}?email-changed=1` : undefined,
  }
})
