import { db, schema } from '@nuxthub/db'
import { and, eq, ne } from 'drizzle-orm'
import { conflict, idParams, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxChannelAccountDto } from '../../../../types'

// Changes a channel account's address, settings, secret name or turns it on or off. Session only.
export default defineEventHandler(async (event): Promise<InboxChannelAccountDto> => {
  await authorize(event, inboxAccess.permissions.channels)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxChannelPatchInput.parse)
  const row = await findInboxChannelAccount(id)
  if (!row) throw notFound('Channel account not found.')

  const values: Partial<typeof schema.inboxChannelAccounts.$inferInsert> = {}
  if (input.address !== undefined) {
    const address = inboxNormaliseAddress(row.channel, input.address)
    const [taken] = await db.select({ id: schema.inboxChannelAccounts.id }).from(schema.inboxChannelAccounts)
      .where(and(eq(schema.inboxChannelAccounts.channel, row.channel), eq(schema.inboxChannelAccounts.address, address), ne(schema.inboxChannelAccounts.id, row.id))).limit(1)
    if (taken) throw conflict('This address is already connected to a mailbox.', { field: 'address' })
    values.address = address
  }
  if (input.config !== undefined) values.config = input.config
  if (input.secretRef !== undefined) values.secretRef = input.secretRef
  if (input.enabled !== undefined) values.enabled = input.enabled
  if (!Object.keys(values).length) return toInboxChannelAccountDto(row, !!inboxSecret(row.secretRef, event))
  const [updated] = await db.update(schema.inboxChannelAccounts).set(values).where(eq(schema.inboxChannelAccounts.id, row.id)).returning()
  return toInboxChannelAccountDto(updated!, !!inboxSecret(updated!.secretRef, event))
})
