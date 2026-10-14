import { db, schema } from '@nuxthub/db'
import { desc, gte } from 'drizzle-orm'

const DAYS = 30

export default defineEventHandler(async (event) => {
  await authorizeUsersAdmin(event, 'view')

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  const rows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    emailVerifiedAt: schema.users.emailVerifiedAt,
    createdAt: schema.users.createdAt,
  })
    .from(schema.users)
    .where(gte(schema.users.createdAt, since))
    .orderBy(desc(schema.users.createdAt))
    .limit(10)
  const subscriptions = await latestSubscriptions(rows.map(row => row.id))
  return rows.map(row => ({ ...row, subscription: subscriptions.get(row.id) ?? null }))
})
