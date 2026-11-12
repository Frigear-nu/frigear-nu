import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// Purchased tickets snapshot their addons, so deleting catalogue rows never changes them.
export default defineEventHandler(async (event) => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [row] = await db.delete(schema.eventAddons).where(eq(schema.eventAddons.id, id)).returning({ id: schema.eventAddons.id })
  if (!row) throw notFound('Addon not found.')
  return noContent(event)
})
