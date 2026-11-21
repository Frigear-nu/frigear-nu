import { db, schema } from '@nuxthub/db'
import { conflict, created, validationError } from '@frigear-nu/module-kit/server'
import { newInboxId } from '../../../utils'
import { inboxAccess } from '../../../access'
import type { InboxChannelAccountDto } from '../../../../types'

// Connects a channel identity to a mailbox: an email address, a WhatsApp phone number id, a page or Instagram account
// id, or a form slug. Secrets are never sent here: `secretRef` names one in the runtime config. Session only.
export default defineEventHandler(async (event): Promise<InboxChannelAccountDto> => {
  await authorize(event, inboxAccess.permissions.channels)
  const input = await readValidatedBody(event, inboxChannelCreateInput.parse)
  if (!inboxChannel(input.channel)) throw validationError([{ path: ['channel'], message: `The channel "${input.channel}" is not installed.` }], 'Unknown channel')
  const mailbox = await getInboxMailboxOr404(input.mailboxId)

  const [row] = await db.insert(schema.inboxChannelAccounts).values({
    id: newInboxId('ica'),
    mailboxId: mailbox.id,
    channel: input.channel,
    address: inboxNormaliseAddress(input.channel, input.address),
    config: input.config,
    secretRef: input.secretRef ?? null,
    enabled: input.enabled,
  }).onConflictDoNothing().returning()
  if (!row) throw conflict('This address is already connected to a mailbox.', { field: 'address' })
  return created(event, toInboxChannelAccountDto(row, !!inboxSecret(row.secretRef, event)))
})
