import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { ticketToMajor } from '../../money'
import { authorizeEventsRecord } from '../../../utils/admin'

// Staff view of an event's tickets. Names and emails need the separate `events:pii` permission, and the
// QR code (which would let anyone check a ticket in) is never returned.
export default defineScopedMcpTool({
  description: 'List the tickets of an event (staff). Attendee names and emails are only included with the events:pii permission. Amounts are in whole currency units (52.2 = 52.20), not cents.',
  permission: 'events:manage',
  annotations: { readOnlyHint: true },
  inputSchema: { eventId: z.string().describe('The event id.') },
  handler: async ({ eventId }, ctx) => {
    await authorizeEventsRecord(ctx.event, eventId)
    const rows = await db.select({
      ticket: schema.eventTickets,
      userName: schema.users.name,
      userEmail: schema.users.email,
    }).from(schema.eventTickets)
      .leftJoin(schema.users, eq(schema.eventTickets.userId, schema.users.id))
      .where(eq(schema.eventTickets.eventId, eventId))
      .orderBy(asc(schema.eventTickets.createdAt))
    const allow = await ctx.can('events:pii')
    const attendees = rows.map(({ ticket, userName, userEmail }) => redactPii({
      ...ticketToMajor(pick(ticket, ['id', 'ticketTypeId', 'status', 'amount', 'currency', 'checkedInAt', 'createdAt'])),
      addons: ticket.addons.length,
      userName,
      userEmail,
    }, { allow, fields: ['userName', 'userEmail'] }))
    return { notice: piiNotice(allow, 'events:pii', 'Attendee names and emails'), attendees }
  },
})
