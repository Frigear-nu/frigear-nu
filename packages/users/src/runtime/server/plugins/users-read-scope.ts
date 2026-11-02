// `users:read` is staff only: a user the host policy does not let view the users admin cannot pick it for an API token,
// nor be granted it by the OAuth server (both ask through `auth:scope-available`). The routes check the policy again.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('auth:scope-available', async (ctx) => {
    if (ctx.scope.name !== USERS_READ_SCOPE || !ctx.available) return
    ctx.available = await isUsersAdminViewer(ctx.event, ctx.user.id)
  })
})
