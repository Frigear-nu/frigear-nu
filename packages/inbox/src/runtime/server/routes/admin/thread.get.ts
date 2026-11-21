import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { idParams } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxThreadDetailDto } from '../../../../types'

// One thread with its messages and notes, what the caller may do with it and the roles they may hide it below. A
// thread they may not read (another mailbox, hidden from their role) is the same 404 as an unknown one. Every view is
// in the audit log (once per person and thread in 15 minutes).
export default defineEventHandler(async (event): Promise<InboxThreadDetailDto> => {
  await authorize(event, inboxAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const thread = await getReadableInboxThreadOr404(event, id)

  const [mailbox, contact, messages, can, roles] = await Promise.all([
    findInboxMailbox(thread.mailboxId),
    findInboxContact(thread.contactId),
    db.select().from(schema.inboxMessages).where(eq(schema.inboxMessages.threadId, thread.id)).orderBy(asc(schema.inboxMessages.createdAtMs), asc(schema.inboxMessages.id)),
    inboxAbilities(event, thread),
    inboxCallerRoles(event),
  ])
  const users = await inboxUserRefs([thread.assigneeId, ...messages.map(message => message.authorId)])
  await inboxAudit(event, { action: 'viewed', threadId: thread.id })
  return {
    thread: toInboxThreadDto(thread),
    mailbox: toInboxMailboxDto(mailbox!),
    contact: contact ? toInboxContactDto(contact, can.pii) : null,
    assignee: thread.assigneeId ? users.get(thread.assigneeId) ?? { id: thread.assigneeId, name: null } : null,
    messages: messages.map(message => toInboxMessageDto(message, message.authorId ? users.get(message.authorId) ?? null : null)),
    can,
    hideRoles: can.hide ? roles : [],
  }
})
