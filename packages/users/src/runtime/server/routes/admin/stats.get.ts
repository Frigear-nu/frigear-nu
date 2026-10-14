import { db, schema } from '@nuxthub/db'
import { count, gte } from 'drizzle-orm'

const DAYS = 30

// Headline numbers for the admin dashboard: everyone, and who signed up in the last 30 days.
export default defineEventHandler(async (event) => {
  await authorizeUsersAdmin(event, 'view')

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  const [[total], [recent]] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.users).where(gte(schema.users.createdAt, since)),
  ])
  return { total: total?.value ?? 0, newMembers: recent?.value ?? 0, days: DAYS }
})
