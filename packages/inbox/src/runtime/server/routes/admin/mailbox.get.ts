import { idParams, notFound } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxMailboxDto } from '../../../../types'

// One mailbox the caller reads; one they may not is the same 404 as an unknown one.
export default defineEventHandler(async (event): Promise<InboxMailboxDto> => {
  await authorize(event, inboxAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await findInboxMailbox(id)
  if (!row || !(await allows(event, inboxAccess.permissions.read, row))) throw notFound('Mailbox not found.')
  return toInboxMailboxDto(row)
})
