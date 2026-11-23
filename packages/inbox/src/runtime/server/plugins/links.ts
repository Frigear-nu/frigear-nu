// Records `inbox:thread:linked` on the thread's audit trail: another module did something for the thread's person from
// the thread (crew's "Add to crew" on the `inbox.thread.actions` slot). Only when the actor can read and answer the
// thread, so a caller cannot write to the trail of a thread they cannot see. Never throws: the linked action happened.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('inbox:thread:linked', async (ctx) => {
    try {
      const thread = await findInboxThread(ctx.threadId)
      if (!thread || ctx.actorId === null) return
      if (!(await inboxUserCanAccessThread(ctx.event, ctx.actorId, thread))) return
      await inboxAudit(ctx.event, {
        action: 'linked',
        threadId: thread.id,
        contactId: thread.contactId,
        actorId: ctx.actorId,
        data: { module: ctx.module, kind: ctx.kind, label: ctx.label ?? null, userId: ctx.userId ?? null, url: ctx.url ?? null },
      })
    }
    catch (error) {
      console.error('[inbox] could not record a linked action', error)
    }
  })
})
