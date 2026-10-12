// Staff scopes are only offered to users the host's `forms:authorize` policy lets in, so the token UI
// does not list scopes whose tools the user could never use.
const STAFF_SCOPES = ['forms:manage', 'forms:pii']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('auth:scope-available', async (ctx) => {
    if (!STAFF_SCOPES.includes(ctx.scope.name)) return
    ctx.available = await canManageForms(ctx.event, { user: ctx.user })
  })
})
