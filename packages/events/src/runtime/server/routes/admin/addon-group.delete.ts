import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'
import { authorizeEventsRecord, eventsIdOfAddonGroup } from '../../utils/admin'

// Purchased tickets snapshot their addons, so deleting catalogue rows never changes them.
export default defineEventHandler(async (event) => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await authorizeEventsRecord(event, await eventsIdOfAddonGroup(id))
  const [row] = await db.delete(schema.eventAddonGroups).where(eq(schema.eventAddonGroups.id, id)).returning({ id: schema.eventAddonGroups.id })
  if (!row) throw notFound('Addon group not found.')
  return noContent(event)
})
