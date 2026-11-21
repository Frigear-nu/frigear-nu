// Creates the maps `maps:seed:resolve` listeners ask for (`ensureMap`, idempotent by key) once per server. It runs on the
// first request rather than at startup, so NuxtHub has applied the migrations and listeners get a request event; later
// requests await a settled promise. Never while prerendering: there is no database binding then.
export default defineNitroPlugin((nitroApp) => {
  if (import.meta.prerender) return
  nitroApp.hooks.hook('request', async (event) => {
    if (getRequestHeader(event, 'x-nitro-prerender')) return
    await ensureMapsSeeded(event)
  })
})
