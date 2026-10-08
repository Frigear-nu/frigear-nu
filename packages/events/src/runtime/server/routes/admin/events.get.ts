import { db, schema } from '@nuxthub/db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  return db.select().from(schema.events).orderBy(desc(schema.events.startsAt))
})
