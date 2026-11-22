import { db, schema } from '@nuxthub/db'
import { asc, inArray, ne, and } from 'drizzle-orm'
import { apiError, chunkParams, idParams, isoDate, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactExportDto } from '../../../../types'

// Everything the inbox holds about a person, for a GDPR access request: the contact and every other contact with the
// same email address (`inboxContactScope`), their details, the messages they sent and received in their threads, and
// the messages they sent in other contacts' threads (a reply by email filed under a contact form thread). Internal
// notes are staff working notes and stay out. The caller must see every one of those threads (mailbox access and
// `hiddenBelow`, as in the thread list), the same rule as erase: a partial export would answer an access request
// incompletely. A contact none of whose threads the caller sees is a 404 (a contact without threads needs
// `inbox:manage`); one with threads hidden from them is a 409 `contact_threads_hidden`, and someone who sees them all
// exports the contact. The export is in the audit log.
export default defineEventHandler(async (event): Promise<InboxContactExportDto> => {
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')

  const scope = await inboxContactScope(contact)
  const all = [...scope.threads, ...scope.foreign]
  const visible = await inboxVisibleThreads(event, all)
  if (!visible.length && (all.length || !(await allows(event, inboxAccess.permissions.manage)))) throw notFound('Contact not found.')
  if (visible.length < all.length) {
    throw apiError(409, 'contact_threads_hidden', 'Some of this contact\'s threads are hidden from you. Someone who sees all of them must export the contact.')
  }

  const messages = []
  for (const chunk of chunkParams(all.map(thread => thread.id))) {
    messages.push(...await db.select().from(schema.inboxMessages)
      .where(and(inArray(schema.inboxMessages.threadId, chunk), ne(schema.inboxMessages.direction, 'note')))
      .orderBy(asc(schema.inboxMessages.createdAtMs)))
  }
  const foreignIds = new Set(scope.foreign.map(thread => thread.id))
  const sentHere = new Set(scope.foreignMessageIds)
  const related = []
  for (const chunk of chunkParams(scope.contactIds.filter(contactId => contactId !== contact.id))) {
    related.push(...await db.select().from(schema.inboxContacts).where(inArray(schema.inboxContacts.id, chunk)).orderBy(asc(schema.inboxContacts.createdAt)))
  }
  await inboxAudit(event, { action: 'exported', contactId: contact.id, data: { threads: all.length, contacts: scope.contactIds.length } })
  const details = (row: typeof contact) => ({ ...toInboxContactDetails(row), createdAt: isoDate(row.createdAt), erasedAt: isoDate(row.erasedAt) })
  return {
    contact: details(contact),
    related: related.map(details),
    threads: all.map(thread => ({
      thread: toInboxThreadDto(thread),
      messages: messages
        // In another contact's thread, only what they sent there.
        .filter(message => message.threadId === thread.id && (!foreignIds.has(thread.id) || sentHere.has(message.id)))
        .map((message) => {
          const { author: _author, ...rest } = toInboxMessageDto(message, null, true)
          return rest
        }),
    })),
    exportedAt: new Date().toISOString(),
  }
})
