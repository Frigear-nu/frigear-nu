import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { eventInput } from '../../utils/admin-schemas'
import { assertMembershipAvailable } from '../../utils/admin'

const patchSchema = eventInput.omit({ ticketTypes: true }).partial()

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, patchSchema.parse)
  await assertMembershipAvailable(patch)
  const [row] = await db.update(schema.events).set(patch).where(eq(schema.events.id, getRouterParam(event, 'id')!)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
  return row
})
