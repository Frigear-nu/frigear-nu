import { db, schema } from '@nuxthub/db'
import { asc, eq, inArray, ne, and } from 'drizzle-orm'
import { idParams, isoDate, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxContactExportDto } from '../../../../types'

// Everything the inbox holds about a contact, for a GDPR access request: their details and the messages they sent and
// received. Internal notes are staff working notes and stay out. The export is in the audit log.
export default defineEventHandler(async (event): Promise<InboxContactExportDto> => {
  await authorize(event, inboxAccess.permissions.pii)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const contact = await findInboxContact(id)
  if (!contact) throw notFound('Contact not found.')

  const threads = await db.select().from(schema.inboxThreads).where(eq(schema.inboxThreads.contactId, contact.id)).orderBy(asc(schema.inboxThreads.createdAt))
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
        const { author: _author, ...rest } = toInboxMessageDto(message)
        return rest
      }),
    })),
    exportedAt: new Date().toISOString(),
  }
})
