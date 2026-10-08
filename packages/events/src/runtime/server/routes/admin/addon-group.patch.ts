import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { addonGroupInput } from '../../utils/admin-schemas'

const patchSchema = addonGroupInput.omit({ addons: true }).partial()

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, patchSchema.parse)
  const [row] = await db.update(schema.eventAddonGroups).set(patch).where(eq(schema.eventAddonGroups.id, getRouterParam(event, 'id')!)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Addon group not found.' })
  return row
})
