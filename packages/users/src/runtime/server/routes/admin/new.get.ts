import { db, schema } from '@nuxthub/db'
import { desc, gte } from 'drizzle-orm'

const DAYS = 30

export default defineEventHandler(async (event) => {
  await authorizeUsersAdmin(event, 'list')

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  const rows = await db.select()
    .from(schema.users)
    .where(gte(schema.users.createdAt, since))
    .orderBy(desc(schema.users.createdAt))
    .limit(10)
  const subscriptions = await latestSubscriptions(rows.map(row => row.id))
  return rows.map(row => ({ ...toAdminUserDto(row), subscription: subscriptions.get(row.id) ?? null }))
})
