import { db, schema } from '@nuxthub/db'
import { and, count, eq, getTableColumns, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxAuditDto } from '../../../../types'

// Who viewed, answered, assigned, hid, exported and erased what: newest first, by thread, contact or action. Only the
// entries whose subject the caller could see, as in the thread list:
// - an entry of a thread: the thread is in a mailbox they read and not hidden below a role they lack (a deleted
//   thread: its recorded mailbox);
// - a retention run: its mailbox;
// - an export or erase: a contact with at least one thread they see;
// - anything else (entries written before the mailbox was recorded): `inbox:manage`.
export default defineEventHandler(async (event): Promise<Page<InboxAuditDto>> => {
  await authorize(event, inboxAccess.permissions['inbox-audit:pii'])
  const query = await getValidatedQuery(event, inboxAuditQuery.parse)
  const audit = schema.inboxAudit
  const threads = schema.inboxThreads
  const readable = (await inboxReadableMailboxes(event)).map(mailbox => mailbox.id)
  const manage = await allows(event, inboxAccess.permissions.manage)
  if (!readable.length && !manage) return paginate({ items: [], total: 0, query })
  const roles = await inboxCallerRoles(event)
  const notHidden = roles.length ? or(isNull(threads.hiddenBelow), inArray(threads.hiddenBelow, roles)) : isNull(threads.hiddenBelow)

  const visible: (SQL | undefined)[] = []
  if (readable.length) {
    visible.push(
      and(isNotNull(threads.id), inArray(threads.mailboxId, readable), notHidden),
      and(isNull(threads.id), isNotNull(audit.mailboxId), inArray(audit.mailboxId, readable)),
      and(isNull(audit.threadId), isNull(audit.mailboxId), isNotNull(audit.contactId), inArray(
        audit.contactId,
        db.select({ contactId: threads.contactId }).from(threads).where(and(inArray(threads.mailboxId, readable), notHidden)),
      )),
    )
  }
  if (manage) visible.push(and(isNull(threads.id), isNull(audit.mailboxId), isNull(audit.contactId)))

  const conditions: (SQL | undefined)[] = [or(...visible)]
  if (query.threadId) conditions.push(eq(audit.threadId, query.threadId))
  if (query.contactId) conditions.push(eq(audit.contactId, query.contactId))
  if (query.action) conditions.push(eq(audit.action, query.action))
  const where = and(...conditions)
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select(getTableColumns(audit)).from(audit).leftJoin(threads, eq(threads.id, audit.threadId)).where(where)
      .orderBy(...orderByQuery({ createdAt: audit.createdAt }, query, { tiebreaker: audit.id })).limit(limit).offset(offset),
    db.select({ total: count() }).from(audit).leftJoin(threads, eq(threads.id, audit.threadId)).where(where),
  ])
  const users = await inboxUserRefs(rows.map(row => row.actorId))
  return paginate({
    total: Number(totals?.total ?? 0),
    query,
    items: rows.map(row => toInboxAuditDto(row, row.actorId ? users.get(row.actorId) ?? null : null)),
  })
})
