import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, validationError } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxThreadDto } from '../../../../types'

// Hides a thread from everybody below a global role (`role: null` shows it again). The role must be one the caller
// holds, so nobody hides a thread from themselves; the assignee is dropped when they do not hold it. People below the
// role get the same 404 as for an unknown thread.
export default defineEventHandler(async (event): Promise<InboxThreadDto> => {
  await authorize(event, inboxAccess.permissions.hide)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxHideInput.parse)
  const thread = await getReadableInboxThreadOr404(event, id)
  await authorize(event, inboxAccess.permissions.hide, thread)
  if (input.role && !(await inboxCallerRoles(event)).includes(input.role)) {
    throw validationError([{ path: ['role'], message: 'Choose one of your own roles.' }], 'Invalid role')
  }
  if ((thread.hiddenBelow ?? null) === input.role) return toInboxThreadDto(thread)

  let assigneeId = thread.assigneeId
  if (input.role && assigneeId && !(await inboxUserCanAccessThread(event, assigneeId, { mailboxId: thread.mailboxId, hiddenBelow: input.role }))) assigneeId = null
  const [updated] = await db.update(schema.inboxThreads).set({ hiddenBelow: input.role, assigneeId }).where(eq(schema.inboxThreads.id, thread.id)).returning()
  await inboxAudit(event, { action: 'hidden', threadId: thread.id, data: { from: thread.hiddenBelow ?? null, to: input.role } })
  if (assigneeId !== thread.assigneeId) {
    await useNitroApp().hooks.callHook('inbox:thread:assigned', { event, thread: toInboxThreadDto(updated!), assigneeId, previous: thread.assigneeId ?? null })
  }
  return toInboxThreadDto(updated!)
})
