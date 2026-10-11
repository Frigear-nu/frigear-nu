import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'
import { assertMembershipAvailable, insertTicketType } from '../../utils/admin'
import { eventInput } from '../../utils/admin-schemas'

// Creates an event, optionally with its whole catalogue (ticket types -> addon groups -> addons).
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const { ticketTypes, ...input } = await readValidatedBody(event, eventInput.parse)
  await assertMembershipAvailable(input, ...(ticketTypes ?? []))

  const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, input.slug)).limit(1)
  if (taken) throw createError({ statusCode: 409, statusMessage: 'An event with this slug already exists.' })

  const [row] = await db.insert(schema.events).values({
    id: newId('evn'),
    ...input,
    requiresMembership: input.requiresMembership ?? null,
  }).returning()
  for (const type of ticketTypes ?? []) await insertTicketType(row!.id, type)
  setResponseStatus(event, 201)
  return row
})
