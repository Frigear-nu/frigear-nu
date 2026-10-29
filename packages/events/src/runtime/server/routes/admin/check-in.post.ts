import { db, schema } from '@nuxthub/db'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { conflict, notFound } from '@frigear-nu/module-kit/server'
import type { CheckInResponse } from '../../../../types'

const bodySchema = z.object({ code: z.string().min(1) })

// Idempotent: scanning an already checked-in ticket reports `alreadyCheckedIn` and its first scan time.
export default defineEventHandler(async (event): Promise<CheckInResponse> => {
  const { userId } = await eventsStaff.require(event)
  const { code } = await readValidatedBody(event, bodySchema.parse)

  const [ticket] = await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.code, code)).limit(1)
  if (!ticket) throw notFound('Unknown ticket code.')
  if (ticket.status !== 'paid') throw conflict(`This ticket is ${ticket.status}, not valid for entry.`, { status: ticket.status })

  const [claimed] = await db.update(schema.eventTickets)
    .set({ checkedInAt: new Date(), checkedInBy: userId })
    .where(and(eq(schema.eventTickets.id, ticket.id), isNull(schema.eventTickets.checkedInAt)))
    .returning()

  const row = claimed ?? (await db.select().from(schema.eventTickets).where(eq(schema.eventTickets.id, ticket.id)).limit(1))[0]!
  const [dto] = await toTicketDtos([row])
  return { ok: true, alreadyCheckedIn: !claimed, checkedInAt: row.checkedInAt!.toISOString(), ticket: { ...dto!, code: null } }
})
