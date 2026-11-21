import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { likeContains, orderByQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxThreadListItemDto } from '../../../../types'

// The threads of the mailboxes the caller reads, without those hidden from their roles: filtered by mailbox, status
// (`active`, the default, is open or pending; `all` is any), assignee (`me`, `none` or a user id) and channel; `q` searches the subject. Latest
// message first by default. Contact details only with `inbox:pii`.
export default defineEventHandler(async (event): Promise<Page<InboxThreadListItemDto>> => {
  const principal = await authorize(event, inboxAccess.permissions.read)
  const query = await getValidatedQuery(event, inboxThreadsQuery.parse)
  const mailboxes = (await inboxReadableMailboxes(event)).map(mailbox => mailbox.id)
  const ids = query.mailbox ? mailboxes.filter(id => id === query.mailbox) : mailboxes
  if (!ids.length) return paginate({ items: [], total: 0, query })

  const roles = await inboxCallerRoles(event)
  const conditions: (SQL | undefined)[] = [
    inArray(schema.inboxThreads.mailboxId, ids),
    roles.length ? or(isNull(schema.inboxThreads.hiddenBelow), inArray(schema.inboxThreads.hiddenBelow, roles)) : isNull(schema.inboxThreads.hiddenBelow),
  ]
  if (query.status === 'active') conditions.push(inArray(schema.inboxThreads.status, ['open', 'pending']))
  else if (query.status !== 'all') conditions.push(eq(schema.inboxThreads.status, query.status))
  if (query.assignee === 'me') conditions.push(eq(schema.inboxThreads.assigneeId, Number(principal.user.id)))
  else if (query.assignee === 'none') conditions.push(isNull(schema.inboxThreads.assigneeId))
  else if (typeof query.assignee === 'number') conditions.push(eq(schema.inboxThreads.assigneeId, query.assignee))
  if (query.channel) conditions.push(eq(schema.inboxThreads.channel, query.channel))
  if (query.q) conditions.push(likeContains(schema.inboxThreads.subject, query.q))
  const where = and(...conditions)

  const orderBy = orderByQuery({
    lastMessageAt: schema.inboxThreads.lastMessageAt,
    createdAt: schema.inboxThreads.createdAt,
    status: schema.inboxThreads.status,
  }, query, { tiebreaker: schema.inboxThreads.id })
  const { limit, offset } = pageRange(query)
  const [rows, [totals]] = await Promise.all([
    db.select().from(schema.inboxThreads).where(where).orderBy(...orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(schema.inboxThreads).where(where),
  ])

  const pii = await allows(event, inboxAccess.permissions.pii)
  const contactIds = [...new Set(rows.map(row => row.contactId))]
  const contacts = contactIds.length ? await db.select().from(schema.inboxContacts).where(inArray(schema.inboxContacts.id, contactIds)) : []
  const contactById = new Map(contacts.map(contact => [contact.id, contact]))
  const users = await inboxUserRefs(rows.map(row => row.assigneeId))

  const items: InboxThreadListItemDto[] = rows.map((row) => {
    const contact = contactById.get(row.contactId)
    return {
      ...toInboxThreadDto(row),
      contact: contact ? toInboxContactDto(contact, pii) : null,
      assignee: row.assigneeId ? users.get(row.assigneeId) ?? { id: row.assigneeId, name: null } : null,
      preview: row.preview ?? null,
    }
  })
  return paginate({ total: Number(totals?.total ?? 0), query, items })
})
