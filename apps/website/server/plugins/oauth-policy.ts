// Host policy for `@frigear-nu/oauth-server`. The module itself knows nothing about roles or admins:
// everything below is decided here.
//
// There is no role model in this app yet, so admins are an email allowlist and nobody has a role
// (applications with `allowedRoles` stay closed until `oauth:user:roles` is implemented).
export default defineNitroPlugin((nitro) => {
  // Applications that sign people in with frigear.nu (the other Frigear apps) map this to their own users, so an admin
  // here is an admin there. Identity claims only: access tokens stay bare.
  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType !== 'access_token' && ctx.scope.includes('profile')) ctx.claims.role = effectiveRole(ctx.user)
  })

  nitro.hooks.hook('oauth:authorize', async (ctx) => {
    const admins = useRuntimeConfig().oauthAdminEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    const user = await getOAuthUser(ctx.userId)
    ctx.allowed = !!user && (admins.includes(user.email.toLowerCase()) || effectiveRole(user) === 'admin')
  })
})
