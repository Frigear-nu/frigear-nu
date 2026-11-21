import { inboxAccess } from '../../../access'
import type { InboxMailboxDto } from '../../../../types'

// The mailboxes the caller reads (every one with `inbox:manage`): a small, bounded list for the filters and settings.
export default defineEventHandler(async (event): Promise<InboxMailboxDto[]> => {
  await authorize(event, inboxAccess.permissions.read)
  return (await inboxReadableMailboxes(event)).map(toInboxMailboxDto)
})
