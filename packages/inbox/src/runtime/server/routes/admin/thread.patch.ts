import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, validationError } from '@frigear-nu/module-kit/server'
import { inboxAccess } from '../../../access'
import type { InboxThreadDto } from '../../../../types'

// Changes a thread's status (`inbox:reply`) or assignee (`inbox:assign`). The assignee must be a user who answers in
// inboxes (`inbox:reply`) and holds the thread's `hiddenBelow` role. Fires `inbox:thread:status-changed` and
// `inbox:thread:assigned`.
export default defineEventHandler(async (event): Promise<InboxThreadDto> => {
  await authorize(event, inboxAccess.permissions.read)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, inboxThreadPatchInput.parse)
  if (input.status !== undefined) await authorize(event, inboxAccess.permissions.reply)
  if (input.assigneeId !== undefined) await authorize(event, inboxAccess.permissions.assign)
  let thread = await getReadableInboxThreadOr404(event, id)
  if (input.status !== undefined) await authorize(event, inboxAccess.permissions.reply, thread)
  if (input.assigneeId !== undefined) await authorize(event, inboxAccess.permissions.assign, thread)

  if (input.assigneeId !== undefined && input.assigneeId !== thread.assigneeId) {
    if (input.assigneeId !== null) await inboxCheckAssignee(event, input.assigneeId, thread.hiddenBelow)
    const previous = thread.assigneeId ?? null
    thread = (await db.update(schema.inboxThreads).set({ assigneeId: input.assigneeId }).where(eq(schema.inboxThreads.id, thread.id)).returning())[0]!
    await useNitroApp().hooks.callHook('inbox:thread:assigned', { event, thread: toInboxThreadDto(thread), assigneeId: input.assigneeId, previous })
    await inboxAudit(event, { action: 'assigned', threadId: thread.id, data: { from: previous, to: input.assigneeId } })
  }
  if (input.status !== undefined) thread = await inboxSetStatus(event, thread, input.status)
  return toInboxThreadDto(thread)
})

/** 400 unless the user exists, answers in inboxes and holds the thread's `hiddenBelow` role. */
async function inboxCheckAssignee(event: Parameters<typeof userCan>[0], assigneeId: number, hiddenBelow: string | null) {
  const user = await loadAuthUser(assigneeId)
  const issue = (message: string) => validationError([{ path: ['assigneeId'], message }], 'Invalid assignee')
  if (!user) throw issue('This user does not exist.')
  if (!(await userCan(event, assigneeId, inboxAccess.permissions.reply))) throw issue('This user does not answer in inboxes.')
  if (hiddenBelow && !(await getEffectiveRoles(event, user)).includes(hiddenBelow)) throw issue('The thread is hidden from this user.')
}
