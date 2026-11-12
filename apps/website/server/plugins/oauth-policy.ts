// Host claims for `@frigear-nu/oauth-server`. Who manages applications is a role question (`oauth:manage`: admins).

// Most senior first: `role` is the first of these the user holds, as the other Frigear apps read one role.
const seniority = ['admin', 'manager', 'coordinator', 'eventmanager', 'barmanager', 'crew', 'member', 'supplier', 'partner', 'user']

export default defineNitroPlugin((nitro) => {
  // Applications that sign people in with frigear.nu (the other Frigear apps) map these to their own users, so an admin
  // here is an admin there. Identity claims only: access tokens stay bare. `ctx.roles` are the effective roles
  // (assigned, default and allowlisted, closed over `inherit`).
  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType === 'access_token' || !ctx.scope.includes('profile')) return
    ctx.claims.roles = ctx.roles
    ctx.claims.role = seniority.find(role => ctx.roles.includes(role)) ?? 'user'
  })
})
