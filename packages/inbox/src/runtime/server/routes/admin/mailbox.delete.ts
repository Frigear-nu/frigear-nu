import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { apiError, idParams, noContent } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'

// Deletes an empty mailbox with its channel accounts. One with threads answers 409 `mailbox_not_empty`: threads are
// removed by retention or a contact erase, never by deleting their mailbox.
export default defineEventHandler(async (event) => {
  await authorize(event, inboxAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getInboxMailboxOr404(id)
  const [thread] = await db.select({ id: schema.inboxThreads.id }).from(schema.inboxThreads).where(eq(schema.inboxThreads.mailboxId, row.id)).limit(1)
  if (thread) throw apiError(409, 'mailbox_not_empty', 'This mailbox still has threads.')
  await db.delete(schema.inboxChannelAccounts).where(eq(schema.inboxChannelAccounts.mailboxId, row.id))
  await db.delete(schema.inboxMailboxes).where(eq(schema.inboxMailboxes.id, row.id))
  return noContent(event)
})
