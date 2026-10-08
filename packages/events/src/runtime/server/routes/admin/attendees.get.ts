import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'

// Every ticket of an event (all statuses) with the holder's name/email, including QR codes for staff.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const rows = await db.select({
    ticket: schema.eventTickets,
    userName: schema.users.name,
    userEmail: schema.users.email,
  }).from(schema.eventTickets)
    .leftJoin(schema.users, eq(schema.eventTickets.userId, schema.users.id))
    .where(eq(schema.eventTickets.eventId, getRouterParam(event, 'id')!))
    .orderBy(asc(schema.eventTickets.createdAt))
  return rows.map(({ ticket, userName, userEmail }) => ({ ...ticket, userName, userEmail }))
})
