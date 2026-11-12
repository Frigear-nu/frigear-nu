// The host side of the module: which roles a user has (the roles are declared in `nuxt.config.ts`) and which claims are
// added. Domains stand in for a real role model: `@staff.test` = staff (and, inherited, member and user),
// `@member.test` = member.
const rolesFor = (email: string) => email.endsWith('@staff.test')
  ? ['staff']
  : email.endsWith('@member.test') ? ['member'] : []

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    ctx.roles.push(...rolesFor(String(ctx.user.email ?? '')))
  })

  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType === 'access_token') return
    const role = ['staff', 'member'].find(name => ctx.roles.includes(name)) ?? 'user'
    ctx.claims.role = role
    ctx.claims['https://frigear.test/claims/role'] = role
    // Even an attempt to overwrite registered claims must not survive.
    ctx.claims.sub = 'attacker'
    ctx.claims.permissions = ['*']
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
