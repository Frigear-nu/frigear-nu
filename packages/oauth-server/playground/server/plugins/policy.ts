// The playground's role model: the part of the email before the `@` is the role (`admin@example.com` is an admin and
// manages applications, `member@example.com` has the `member` role). Roles are declared in `nuxt.config.ts`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    const role = String(ctx.user.email ?? '').split('@')[0]
    if (role) ctx.roles.push(role)
  })

  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType !== 'access_token') ctx.claims.role = ctx.roles[0] ?? 'user'
  })
})
