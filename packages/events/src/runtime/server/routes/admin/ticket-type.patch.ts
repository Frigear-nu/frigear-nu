import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { ticketTypeInput } from '../../utils/admin-schemas'

const patchSchema = ticketTypeInput.omit({ addonGroups: true }).partial()

export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const patch = await readValidatedBody(event, patchSchema.parse)
  const [row] = await db.update(schema.eventTicketTypes).set(patch).where(eq(schema.eventTicketTypes.id, getRouterParam(event, 'id')!)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Ticket type not found.' })
  return row
})
