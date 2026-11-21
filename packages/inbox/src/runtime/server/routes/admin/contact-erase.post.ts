import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError, idParams, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactDto } from '../../../../types'

// Erases a contact (GDPR): their details go and every message of their threads is blanked; the threads stay, empty,
// as a record that something was answered. Needs `inbox:manage` and `inbox:pii`, and the caller must see every thread
// of the contact (mailbox access and `hiddenBelow`): the contact's details are shared by all their threads, so an
// erase is all or nothing. One they see none of is a 404; one with threads hidden from them is a 409
// `contact_threads_hidden`, and someone who sees them all erases the contact. In the audit log.
export default defineEventHandler(async (event): Promise<InboxContactDto & { threads: number }> => {
  await authorize(event, inboxAccess.permissions.manage)
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')
  const all = await db.select({ id: schema.inboxThreads.id, mailboxId: schema.inboxThreads.mailboxId, hiddenBelow: schema.inboxThreads.hiddenBelow })
    .from(schema.inboxThreads).where(eq(schema.inboxThreads.contactId, contact.id))
  const visible = await inboxVisibleThreads(event, all)
  if (all.length && !visible.length) throw notFound('Contact not found.')
  if (visible.length < all.length) {
    throw apiError(409, 'contact_threads_hidden', 'Some of this contact\'s threads are hidden from you. Someone who sees all of them must erase the contact.')
  }
  const { threads } = await inboxEraseContact(contact.id)
  await inboxAudit(event, { action: 'erased', contactId: contact.id, data: { threads } })
  const erased = await findInboxContact(contact.id)
  return { ...toInboxContactDto(erased!, true), threads }
})
