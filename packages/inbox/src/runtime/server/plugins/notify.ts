import { readTranslated } from '@frigear-nu/notify/utils'

// The assignee of a thread hears about a new message through notify's `notifyUser`, on the channels they chose for the
// `inbox.message` topic (push by default), in their own language (`users.locale`, English when it is not set). The text
// says which mailbox, never who wrote or what.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('inbox:message:received', async (ctx) => {
    const assigneeId = ctx.thread.assigneeId
    if (!assigneeId) return
    try {
      const pages = useRuntimeConfig(ctx.event).public.inbox?.pages
      const url = pages?.adminThread?.replace(':id', encodeURIComponent(ctx.thread.id))
      const title = { da: 'Ny besked i indbakken', en: 'New inbox message' }
      const body = { da: 'Der er en ny besked i en tråd, du er tildelt.', en: 'There is a new message in a thread assigned to you.' }
      const locale = (await loadUserRefs([assigneeId])).get(assigneeId)?.locale || 'en'
      const subject = readTranslated(title, locale)
      const text = readTranslated(body, locale)
      await notifyUser(assigneeId, {
        topic: 'inbox.message',
        push: { title, body, ...(url ? { url } : {}) },
        email: { subject, body: `<p>${text}</p>`, text },
      })
    }
    catch (error) {
      console.error('[inbox] could not notify the assignee', error)
    }
  })
})
