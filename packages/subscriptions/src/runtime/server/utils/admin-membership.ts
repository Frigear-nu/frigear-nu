import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { isEntitledRow } from '../../utils/plans'

/** The user's subscription rows, newest first. */
export const listUserSubscriptionRows = (userId: number) =>
  db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId)).orderBy(desc(schema.subscriptions.createdAt))

export type AdminMembershipRow = Awaited<ReturnType<typeof listUserSubscriptionRows>>[number]

/** The row currently entitling the user (manual grant or Stripe subscription), preferring the latest period end. */
export function currentEntitledRow(rows: AdminMembershipRow[]) {
  return rows
    .filter(row => isEntitledRow(row))
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? Number.POSITIVE_INFINITY) - (a.currentPeriodEnd?.getTime() ?? Number.POSITIVE_INFINITY))[0]
}
