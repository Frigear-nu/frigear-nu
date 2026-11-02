// The host side of the module: who is an admin, which roles a user has, and which claims are added.
// Domains stand in for a real role model: `@staff.test` = staff + member, `@member.test` = member.
const rolesFor = (email: string) => email.endsWith('@staff.test')
  ? ['staff', 'member']
  : email.endsWith('@member.test') ? ['member'] : []

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('oauth:authorize', async (ctx) => {
    const user = await getOAuthUser(ctx.userId)
    ctx.allowed = !!user?.email.endsWith('@staff.test')
  })

  // Staff may view the users admin, so only they may hold `users:read`.
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    const user = await getOAuthUser(ctx.userId)
    ctx.allowed = ctx.action === 'view' && !!user?.email.endsWith('@staff.test')
  })

  nitro.hooks.hook('oauth:user:roles', async (ctx) => {
    const user = await getOAuthUser(ctx.userId)
    if (user) ctx.roles.push(...rolesFor(user.email))
  })

  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType === 'access_token') return
    ctx.claims.role = ctx.roles[0] ?? 'user'
    ctx.claims['https://frigear.test/claims/role'] = ctx.roles[0] ?? 'user'
    // Even an attempt to overwrite registered claims must not survive.
    ctx.claims.sub = 'attacker'
    if (ctx.scope.includes('groups')) ctx.claims.groups = ctx.roles
  })

  nitro.hooks.hook('oauth:application:access', (ctx) => {
    if (ctx.user.email.startsWith('blocked')) {
      ctx.allowed = false
      ctx.reason = 'Blocked by policy.'
    }
  })

  const issued: { applicationId: string, grant: string }[] = []
  nitro.hooks.hook('oauth:token:issued', (ctx) => {
    issued.push({ applicationId: ctx.applicationId, grant: ctx.grant })
  })
  ;(globalThis as Record<string, unknown>).__oauthIssued = issued
})
