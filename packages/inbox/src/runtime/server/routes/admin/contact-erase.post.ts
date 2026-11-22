import { apiError, idParams, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactDto } from '../../../../types'

// Erases a person (GDPR): the contact and every other contact with the same email address (`inboxContactScope`). Their
// details go, every message of their threads is blanked, and so are the messages they sent in other contacts' threads;
// the threads stay, empty, as a record that something was answered. Needs `inbox:manage` and `inbox:pii`, and the
// caller must see every one of those threads (mailbox access and `hiddenBelow`): an erase is all or nothing. One they
// see none of is a 404; one with threads hidden from them is a 409 `contact_threads_hidden`, and someone who sees them
// all erases the contact. In the audit log.
export default defineEventHandler(async (event): Promise<InboxContactDto & { threads: number, messages: number, contacts: number }> => {
  await authorize(event, inboxAccess.permissions.manage)
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')
  const scope = await inboxContactScope(contact)
  const all = [...scope.threads, ...scope.foreign]
  const visible = await inboxVisibleThreads(event, all)
  if (all.length && !visible.length) throw notFound('Contact not found.')
  if (visible.length < all.length) {
    throw apiError(409, 'contact_threads_hidden', 'Some of this contact\'s threads are hidden from you. Someone who sees all of them must erase the contact.')
  }
  const erased = await inboxEraseContact(contact.id, new Date(), scope)
  await inboxAudit(event, { action: 'erased', contactId: contact.id, data: erased })
  const row = await findInboxContact(contact.id)
  return { ...toInboxContactDto(row!, true), ...erased }
})
