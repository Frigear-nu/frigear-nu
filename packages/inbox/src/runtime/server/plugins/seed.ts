// Creates the mailboxes of `inbox.mailboxes` once per server. It runs on the first request rather than at startup, so
// NuxtHub has applied the migrations; later requests await a settled promise. Never while prerendering.
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return
  nitroApp.hooks.hook('request', async (event) => {
    if (getRequestHeader(event, 'x-nitro-prerender')) return
    await inboxEnsureMailboxesSeeded(event)
  })
})
