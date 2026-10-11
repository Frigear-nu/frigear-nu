import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'

const REVERT_TTL_DAYS = 7

// Browser navigation (the link emailed to the new address): applies the change, then tells the old address.
export default defineEventHandler(async (event) => {
  const { code } = await getValidatedQuery(event, z.object({ code: z.string().min(1) }).parse)
  const profilePath = useRuntimeConfig(event).public.account?.pages?.profile || '/'
  const now = new Date()

  const [change] = await db.update(schema.accountEmailChanges)
    .set({ verifiedAt: now, revertExpiresAt: new Date(now.getTime() + REVERT_TTL_DAYS * 24 * 60 * 60 * 1000) })
    .where(and(
      eq(schema.accountEmailChanges.code, code),
      isNull(schema.accountEmailChanges.verifiedAt),
      gt(schema.accountEmailChanges.expiresAt, now),
    ))
    .returning()

  if (!change) {
    return sendRedirect(event, `${profilePath}?error=email-change`)
  }

  const taken = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, change.newEmail) })
  if (taken && taken.id !== change.userId) {
    return sendRedirect(event, `${profilePath}?error=email-change`)
  }

  const [user] = await db.update(schema.users)
    .set({ email: change.newEmail, emailVerifiedAt: now })
    .where(eq(schema.users.id, change.userId))
    .returning()

  if (!user) {
    return sendRedirect(event, `${profilePath}?error=email-change`)
  }

  // Keep the session of the person who made the change in sync.
  const session = await getUserSession(event)
  if (session.user?.id === user.id) {
    await setUserSession(event, { user: mapUserToSession(user) })
  }

  const revertUrl = new URL(`/auth/revert-email-change?code=${change.revertCode}`, getRequestURL(event).origin).toString()
  await dispatchEmailNotification(buildEmailChangedNotification({
    to: change.oldEmail,
    name: user.name,
    newEmail: change.newEmail,
    revertUrl,
  }))

  return sendRedirect(event, `${profilePath}?email-changed=1`)
})
