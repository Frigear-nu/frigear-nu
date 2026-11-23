import { db, schema } from '@nuxthub/db'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { inboxAccess } from '../../../access'
import type { InboxChannelAccountDto } from '../../../../types'

// Every channel account (`?mailboxId=` narrows to one mailbox), with whether its secret resolves on this server.
// Session only: a token never sees how the channels are wired.
export default defineEventHandler(async (event): Promise<InboxChannelAccountDto[]> => {
  await authorize(event, inboxAccess.permissions.channels)
  const query = await getValidatedQuery(event, z.object({ mailboxId: z.string().trim().min(1).max(64).optional() }).parse)
  const rows = await db.select().from(schema.inboxChannelAccounts)
    .where(query.mailboxId ? eq(schema.inboxChannelAccounts.mailboxId, query.mailboxId) : undefined)
    .orderBy(asc(schema.inboxChannelAccounts.channel), asc(schema.inboxChannelAccounts.address))
  return rows.map(row => toInboxChannelAccountDto(row, !!inboxSecret(row.secretRef, event)))
})
