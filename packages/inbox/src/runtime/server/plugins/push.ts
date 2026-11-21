// Only added when `@frigear-nu/push` is installed: the assignee of a thread hears about a new message on the channels
// they chose for the `inbox.message` topic (push by default). The text says which mailbox, never who wrote or what.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('inbox:message:received', async (ctx) => {
    const assigneeId = ctx.thread.assigneeId
    if (!assigneeId) return
    try {
      const pages = useRuntimeConfig(ctx.event).public.inbox?.pages
      const url = pages?.adminThread?.replace(':id', encodeURIComponent(ctx.thread.id))
      const title = { da: 'Ny besked i indbakken', en: 'New inbox message' }
      const body = { da: 'Der er en ny besked i en tråd, du er tildelt.', en: 'There is a new message in a thread assigned to you.' }
      await notifyUser(ctx.event, assigneeId, {
        topic: 'inbox.message',
        push: { title, body, ...(url ? { url } : {}) },
        email: { subject: title.en, body: `<p>${body.en}</p>`, text: body.en },
      })
    }
    catch (error) {
      console.error('[inbox] could not notify the assignee', error)
    }
  })
})
