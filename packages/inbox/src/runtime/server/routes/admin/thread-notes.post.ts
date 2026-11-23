import { created, idParams } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxMessageDto } from '../../../../types'

// An internal note on a thread: for staff only, never sent to the contact and never in a contact export.
export default defineEventHandler(async (event): Promise<InboxMessageDto> => {
  const principal = await authorize(event, inboxAccess.permissions.reply)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxNoteInput.parse)
  const thread = await getReadableInboxThreadOr404(event, id)
  await authorize(event, inboxAccess.permissions.reply, thread)
  return created(event, await inboxAddNote(event, thread, { body: input.body, authorId: Number(principal.user.id) }))
})
