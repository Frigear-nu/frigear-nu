import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { badRequest } from '@frigear-nu/module-kit/server'
import { EMAIL_REVERT_INVALID, findEmailChangeByRevertCode } from '../../email-change'

// The "Restore" button of the `/auth/revert-email-change` page: puts the old address back. No sign-in needed (the
// old owner may be locked out); the code, emailed to the old address, is the proof.
export default defineEventHandler(async (event) => {
  const { code } = await readValidatedBody(event, z.object({ code: z.string().min(1) }).parse)
  const now = new Date()

  const change = await findEmailChangeByRevertCode(code)
  if (!change?.verifiedAt || change.revertedAt || !change.revertExpiresAt || change.revertExpiresAt <= now) {
    throw badRequest(EMAIL_REVERT_INVALID)
  }

  await assertEmailAvailable(change.oldEmail, { exceptUserId: change.userId, message: 'The old address now belongs to another account.' })

  const [claimed] = await db.update(schema.accountEmailChanges)
    .set({ revertedAt: now })
    .where(and(
      eq(schema.accountEmailChanges.id, change.id),
      isNotNull(schema.accountEmailChanges.verifiedAt),
      isNull(schema.accountEmailChanges.revertedAt),
      gt(schema.accountEmailChanges.revertExpiresAt, now),
    ))
    .returning()

  if (!claimed) {
    throw badRequest(EMAIL_REVERT_INVALID)
  }

  await db.update(schema.users).set({ email: normalizeUserEmail(claimed.oldEmail) }).where(eq(schema.users.id, claimed.userId))

  // A session of this account still carries the new address: sign it out so the next sign-in reflects the revert.
  const session = await getUserSession(event)
  const signedOut = session.user?.id === claimed.userId
  if (signedOut) await clearUserSession(event)

  return { email: claimed.oldEmail, signedOut }
})
