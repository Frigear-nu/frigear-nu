import { db, schema } from '@nuxthub/db'
import { and, count, eq } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxAuditDto } from '../../../../types'

// Who viewed, answered, assigned, hid, exported and erased what: newest first, by thread, contact or action.
export default defineEventHandler(async (event): Promise<Page<InboxAuditDto>> => {
  await authorize(event, inboxAccess.permissions['inbox-audit:pii'])
  const query = await getValidatedQuery(event, inboxAuditQuery.parse)
  const conditions: (SQL | undefined)[] = []
  if (query.threadId) conditions.push(eq(schema.inboxAudit.threadId, query.threadId))
  if (query.contactId) conditions.push(eq(schema.inboxAudit.contactId, query.contactId))
  if (query.action) conditions.push(eq(schema.inboxAudit.action, query.action))
  const where = conditions.length ? and(...conditions) : undefined
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.inboxAudit).where(where).orderBy(...orderByQuery({ createdAt: schema.inboxAudit.createdAt }, query, { tiebreaker: schema.inboxAudit.id })).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.inboxAudit).where(where),
  ])
  const users = await inboxUserRefs(rows.map(row => row.actorId))
  return paginate({
    total: Number(totals?.total ?? 0),
    query,
    items: rows.map(row => toInboxAuditDto(row, row.actorId ? users.get(row.actorId) ?? null : null)),
  })
})
