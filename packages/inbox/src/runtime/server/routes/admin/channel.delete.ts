import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'

// Disconnects a channel account. Its threads stay in the mailbox; replies to them fail with 409 `channel_unavailable`
// until the thread is answered another way. Session only.
export default defineEventHandler(async (event) => {
  await authorize(event, inboxAccess.permissions.channels)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await findInboxChannelAccount(id)
  if (!row) throw notFound('Channel account not found.')
  await db.update(schema.inboxThreads).set({ channelAccountId: null }).where(eq(schema.inboxThreads.channelAccountId, row.id))
  await db.delete(schema.inboxChannelAccounts).where(eq(schema.inboxChannelAccounts.id, row.id))
  return noContent(event)
})
