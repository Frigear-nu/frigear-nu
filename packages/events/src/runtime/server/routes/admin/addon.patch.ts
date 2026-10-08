import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { addonInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, addonInput.partial().parse)
  const [row] = await db.update(schema.eventAddons).set(patch).where(eq(schema.eventAddons.id, getRouterParam(event, 'id')!)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Addon not found.' })
  return row
})
