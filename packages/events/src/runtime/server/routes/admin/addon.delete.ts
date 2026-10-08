import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  await db.delete(schema.eventAddons).where(eq(schema.eventAddons.id, getRouterParam(event, 'id')!))
  return { ok: true }
})
