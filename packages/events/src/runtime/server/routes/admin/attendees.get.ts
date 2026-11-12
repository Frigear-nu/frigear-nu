import { db, schema } from '@nuxthub/db'
import { and, count, eq, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { z } from 'zod'
import { idParams, likeContains, notFound, orderByQuery, pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import type { AttendeeDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['createdAt', 'status', 'checkedInAt', 'name', 'email'],
  defaultSort: 'createdAt',
  defaultOrder: 'asc',
  defaultPageSize: 50,
  filters: {
    status: z.enum(['pending', 'paid', 'cancelled', 'refunded', 'expired']).optional(),
  },
})

// Every ticket of an event (all statuses) with the holder's name/email, including QR codes for staff check-in.
// `q` searches the holder's name and email.
export default defineEventHandler(async (event): Promise<Page<AttendeeDto>> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const query = await getValidatedQuery(event, querySchema.parse)

  const [parent] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!parent) throw notFound('Event not found.')
  await authorize(event, 'events:manage', parent)

  const conditions: (SQL | undefined)[] = [eq(schema.eventTickets.eventId, id)]
  if (query.q) conditions.push(or(likeContains(schema.users.name, query.q), likeContains(schema.users.email, query.q)))
  if (query.status) conditions.push(eq(schema.eventTickets.status, query.status))
  const where = and(...conditions)

  const orderBy = orderByQuery({
    createdAt: schema.eventTickets.createdAt,
    status: schema.eventTickets.status,
    checkedInAt: schema.eventTickets.checkedInAt,
    name: schema.users.name,
    email: schema.users.email,
  }, query, { tiebreaker: schema.eventTickets.id })

  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select({ ticket: schema.eventTickets, userName: schema.users.name, userEmail: schema.users.email })
      .from(schema.eventTickets)
      .leftJoin(schema.users, eq(schema.eventTickets.userId, schema.users.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() })
      .from(schema.eventTickets)
      .leftJoin(schema.users, eq(schema.eventTickets.userId, schema.users.id))
      .where(where),
  ])

  return paginate({
    total: totals?.total ?? 0,
    query,
    items: rows.map(({ ticket, userName, userEmail }) => toAttendeeDto(ticket, { name: userName ?? null, email: userEmail ?? null })),
  })
})
