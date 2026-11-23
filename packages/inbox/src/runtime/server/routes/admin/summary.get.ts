import { db, schema } from '@nuxthub/db'
import { and, count, eq, inArray, isNull, or } from 'drizzle-orm'
import { inboxAccess } from '../../../access'
import type { InboxSummaryDto } from '../../../../types'

// Counts for the dashboard items: open or pending threads nobody has, and those assigned to the caller, in the
// mailboxes they read and among the threads not hidden from them.
export default defineEventHandler(async (event): Promise<InboxSummaryDto> => {
  const principal = await authorize(event, inboxAccess.permissions.read)
  const mailboxes = await inboxReadableMailboxes(event)
  if (!mailboxes.length) return { unassigned: 0, mine: 0, mailboxes: 0 }
  const roles = await inboxCallerRoles(event)
  const base = and(
    inArray(schema.inboxThreads.mailboxId, mailboxes.map(mailbox => mailbox.id)),
    inArray(schema.inboxThreads.status, ['open', 'pending']),
    roles.length ? or(isNull(schema.inboxThreads.hiddenBelow), inArray(schema.inboxThreads.hiddenBelow, roles)) : isNull(schema.inboxThreads.hiddenBelow),
  )
  const [[unassigned], [mine]] = await Promise.all([
    db.select({ total: count() }).from(schema.inboxThreads).where(and(base, isNull(schema.inboxThreads.assigneeId))),
    db.select({ total: count() }).from(schema.inboxThreads).where(and(base, eq(schema.inboxThreads.assigneeId, Number(principal.user.id)))),
  ])
  return { unassigned: Number(unassigned?.total ?? 0), mine: Number(mine?.total ?? 0), mailboxes: mailboxes.length }
})
