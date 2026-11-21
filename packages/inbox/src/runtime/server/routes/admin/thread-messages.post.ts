import { created, idParams } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxMessageDto, InboxThreadDto } from '../../../../types'

// Replies in a thread: the channel it came in on delivers the reply (email, WhatsApp, ...), then it is stored and
// `inbox:message:sent` fires. When the channel fails nothing is stored (502 `delivery_failed`). `status` sets the
// thread's status in the same call (`pending`: waiting for the person).
export default defineEventHandler(async (event): Promise<{ thread: InboxThreadDto, message: InboxMessageDto }> => {
  const principal = await authorize(event, inboxAccess.permissions.reply)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxMessageInput.parse)
  const thread = await getReadableInboxThreadOr404(event, id)
  await authorize(event, inboxAccess.permissions.reply, thread)
  return created(event, await inboxReply(event, thread, { body: input.body, authorId: Number(principal.user.id), status: input.status }))
})
