import { db, schema } from '@nuxthub/db'
import { asc, eq, inArray, ne, and } from 'drizzle-orm'
import { apiError, idParams, isoDate, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactExportDto } from '../../../../types'

// Everything the inbox holds about a contact, for a GDPR access request: their details and the messages they sent and
// received in all their threads. Internal notes are staff working notes and stay out. The caller must see every thread
// of the contact (mailbox access and `hiddenBelow`, as in the thread list), the same rule as erase: a partial export
// would answer an access request incompletely. A contact none of whose threads the caller sees is a 404 (a contact
// without threads needs `inbox:manage`); one with threads hidden from them is a 409 `contact_threads_hidden`, and
// someone who sees them all exports the contact. The export is in the audit log.
export default defineEventHandler(async (event): Promise<InboxContactExportDto> => {
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')

  const all = await db.select().from(schema.inboxThreads).where(eq(schema.inboxThreads.contactId, contact.id)).orderBy(asc(schema.inboxThreads.createdAt))
  const threads = await inboxVisibleThreads(event, all)
  if (!threads.length && (all.length || !(await allows(event, inboxAccess.permissions.manage)))) throw notFound('Contact not found.')
  if (threads.length < all.length) {
    throw apiError(409, 'contact_threads_hidden', 'Some of this contact\'s threads are hidden from you. Someone who sees all of them must export the contact.')
  }

  const messages = []
  for (const chunk of inboxChunks(threads.map(thread => thread.id))) {
    messages.push(...await db.select().from(schema.inboxMessages)
      .where(and(inArray(schema.inboxMessages.threadId, chunk), ne(schema.inboxMessages.direction, 'note')))
      .orderBy(asc(schema.inboxMessages.createdAtMs)))
  }
  await inboxAudit(event, { action: 'exported', contactId: contact.id, data: { threads: threads.length } })
  return {
    contact: { ...toInboxContactDetails(contact), createdAt: isoDate(contact.createdAt), erasedAt: isoDate(contact.erasedAt) },
    threads: threads.map(thread => ({
      thread: toInboxThreadDto(thread),
      messages: messages.filter(message => message.threadId === thread.id).map((message) => {
        const { author: _author, ...rest } = toInboxMessageDto(message, null, true)
        return rest
      }),
    })),
    exportedAt: new Date().toISOString(),
  }
})
