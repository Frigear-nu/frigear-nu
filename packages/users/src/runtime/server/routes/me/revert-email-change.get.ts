import { db, schema } from '@nuxthub/db'
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'

// Browser navigation (the link emailed to the old address): puts the old address back.
export default defineEventHandler(async (event) => {
  const { code } = await getValidatedQuery(event, z.object({ code: z.string().min(1) }).parse)
  const loginPath = useRuntimeConfig(event).public.authentication?.pages?.login || '/'
  const now = new Date()

  const [change] = await db.update(schema.accountEmailChanges)
    .set({ revertedAt: now })
    .where(and(
      eq(schema.accountEmailChanges.revertCode, code),
      isNotNull(schema.accountEmailChanges.verifiedAt),
      isNull(schema.accountEmailChanges.revertedAt),
      gt(schema.accountEmailChanges.revertExpiresAt, now),
    ))
    .returning()

  if (!change) {
    return sendRedirect(event, `${loginPath}?error=email-revert`)
  }

  const taken = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, change.oldEmail) })
  if (taken && taken.id !== change.userId) {
    return sendRedirect(event, `${loginPath}?error=email-revert`)
  }

  await db.update(schema.users).set({ email: change.oldEmail }).where(eq(schema.users.id, change.userId))

  // The session (if any) still carries the new address; sign out so the next login reflects the revert.
  await clearUserSession(event)

  return sendRedirect(event, `${loginPath}?email-reverted=1`)
})
