import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactDto } from '../../../../types'

// Erases a contact (GDPR): their details go and every message of their threads is blanked; the threads stay, empty,
// as a record that something was answered. Needs `inbox:manage` and `inbox:pii`. In the audit log.
export default defineEventHandler(async (event): Promise<InboxContactDto & { threads: number }> => {
  await authorize(event, inboxAccess.permissions.manage)
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')
  const { threads } = await inboxEraseContact(contact.id)
  await inboxAudit(event, { action: 'erased', contactId: contact.id, data: { threads } })
  const erased = await findInboxContact(contact.id)
  return { ...toInboxContactDto(erased!, true), threads }
})
