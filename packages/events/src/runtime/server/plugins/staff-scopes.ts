// Staff scopes are only offered to users the host's `events:authorize` policy lets in, so the token UI
// does not list scopes whose tools the user could never use.
const STAFF_SCOPES = ['events:manage', 'events:pii']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('auth:scope-available', async (ctx) => {
    if (!STAFF_SCOPES.includes(ctx.scope.name)) return
    ctx.available = await canManageEvents(ctx.event, { user: ctx.user })
  })
})
