import { db, schema } from '@nuxthub/db'
import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { RecentPaymentsDto } from '../../../../types'

const DAYS = 30
const LIMIT = 8

// Recent transactions and the last 30 days' revenue for the admin dashboard. Not tied to one user, so it has its own
// permission, `payments:manage`.
export default defineEventHandler(async (event): Promise<RecentPaymentsDto> => {
  await authorize(event, 'payments:manage')

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  const settled = inArray(schema.payments.status, ['paid', 'partially_refunded'])
  const when = sql`coalesce(${schema.payments.paidAt}, ${schema.payments.createdAt})`

  const [revenue, rows] = await Promise.all([
    db.select({
      currency: schema.payments.currency,
      amount: sql<number>`sum(${schema.payments.amount} - ${schema.payments.refundedAmount})`,
      count: count(),
    })
      .from(schema.payments)
      .where(and(settled, gte(schema.payments.paidAt, since)))
      .groupBy(schema.payments.currency)
      .orderBy(desc(count())),
    db.select({ payment: schema.payments, userName: schema.users.name })
      .from(schema.payments)
      .leftJoin(schema.users, eq(schema.users.id, schema.payments.userId))
      .where(inArray(schema.payments.status, ['paid', 'partially_refunded', 'refunded', 'failed']))
      .orderBy(desc(when))
      .limit(LIMIT),
  ])

  return {
    days: DAYS,
    revenue: revenue.map(row => ({ currency: row.currency, amount: Number(row.amount), count: row.count })),
    items: rows.map(row => ({ ...toPaymentDto(row.payment), userName: row.userName })),
  }
})
