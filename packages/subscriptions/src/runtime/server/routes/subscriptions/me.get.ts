import { db, schema } from '@nuxthub/db'
import { desc, eq } from 'drizzle-orm'
import type { MeResponse } from '../../../../types'
import { DEFAULT_ENTITLED_STATUSES } from '../../../utils/plans'

export default defineEventHandler(async (event): Promise<MeResponse> => {
  const { user } = await requireUserSession(event)

  const rows = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, user.id))
    .orderBy(desc(schema.subscriptions.createdAt))

  const iso = (date: Date | null) => (date ? date.toISOString() : null)
  const active = rows
    .filter(row => DEFAULT_ENTITLED_STATUSES.includes(row.status) && !row.endedAt)
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? 0) - (a.currentPeriodEnd?.getTime() ?? 0))[0]

  return {
    subscriptions: rows.map(row => ({
      id: row.id,
      planKey: row.planKey,
      priceId: row.priceId,
      status: row.status,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      currentPeriodStart: iso(row.currentPeriodStart),
      currentPeriodEnd: iso(row.currentPeriodEnd),
      endedAt: iso(row.endedAt),
    })),
    activePlan: active?.planKey ?? null,
  }
})
