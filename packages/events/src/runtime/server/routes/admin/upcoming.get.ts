import { db, schema } from '@nuxthub/db'
import { and, asc, count, eq, gte } from 'drizzle-orm'

const LIMIT = 5

// The next published events and how many there are, for the admin dashboard.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)

  const upcoming = and(eq(schema.events.status, 'published'), gte(schema.events.startsAt, new Date()))
  const [[total], items] = await Promise.all([
    db.select({ value: count() }).from(schema.events).where(upcoming),
    db.select({
      id: schema.events.id,
      name: schema.events.name,
      location: schema.events.location,
      startsAt: schema.events.startsAt,
    }).from(schema.events).where(upcoming).orderBy(asc(schema.events.startsAt)).limit(LIMIT),
  ])
  return { total: total?.value ?? 0, items }
})
