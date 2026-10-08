import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Purchased tickets snapshot their addons, so deleting catalogue rows never changes them.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  await db.delete(schema.eventAddonGroups).where(eq(schema.eventAddonGroups.id, getRouterParam(event, 'id')!))
  return { ok: true }
})
