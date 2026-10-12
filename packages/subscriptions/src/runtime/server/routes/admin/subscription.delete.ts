import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'

// Revokes the user's manual (free) grant. Paid Stripe subscriptions are managed in Stripe / the billing portal.
export default defineEventHandler(async (event) => {
  const { target } = await loadAdminMembershipTarget(event, 'update')
  const revoked = await db.update(schema.subscriptions)
    .set({ status: 'canceled', endedAt: new Date() })
    .where(and(
      eq(schema.subscriptions.userId, target.id),
      eq(schema.subscriptions.source, 'manual'),
      isNull(schema.subscriptions.endedAt),
    ))
    .returning({ id: schema.subscriptions.id })
  if (!revoked.length) {
    throw createError({ statusCode: 404, statusMessage: 'The user has no free membership to revoke.' })
  }
  return { revoked: revoked.length }
})
