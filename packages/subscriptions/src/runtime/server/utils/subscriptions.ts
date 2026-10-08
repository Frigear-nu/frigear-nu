import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import { DEFAULT_ENTITLED_STATUSES } from '../../utils/plans'

export type HasActiveSubscriptionOptions = {
  /** Only count subscriptions on one of these plan keys. Omit for "any plan". */
  plans?: string[]
  /** Statuses that count as entitled. Defaults to `active` and `trialing`. */
  statuses?: string[]
}

/**
 * The user's current entitled subscription row (default statuses `active`/`trialing`, not ended), the one
 * with the latest period end when several match, or `null`.
 */
export async function getUserSubscription(userId: number, options: Pick<HasActiveSubscriptionOptions, 'statuses'> = {}) {
  const statuses = options.statuses ?? DEFAULT_ENTITLED_STATUSES
  const rows = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(desc(schema.subscriptions.createdAt))

  const entitled = rows
    .filter(row => statuses.includes(row.status) && !row.endedAt)
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? 0) - (a.currentPeriodEnd?.getTime() ?? 0))
  return entitled[0] ?? null
}

/** Whether the user holds an entitled subscription, optionally restricted to specific plans. */
export async function hasActiveSubscription(userId: number, options: HasActiveSubscriptionOptions = {}): Promise<boolean> {
  const statuses = options.statuses ?? DEFAULT_ENTITLED_STATUSES
  const rows = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId))
  return rows.some(row =>
    statuses.includes(row.status)
    && !row.endedAt
    && (!options.plans?.length || (row.planKey !== null && options.plans.includes(row.planKey))),
  )
}
