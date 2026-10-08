// The playground's role model: the part of the email before the `@` is the role.
// `admin@example.com` manages applications, `member@example.com` has the `member` role.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('oauth:authorize', async (ctx) => {
    ctx.allowed = (await getOAuthUser(ctx.userId))?.email.startsWith('admin@') ?? false
  })

  nitro.hooks.hook('oauth:user:roles', async (ctx) => {
    const user = await getOAuthUser(ctx.userId)
    if (user) ctx.roles.push(user.email.split('@')[0]!)
  })

  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType !== 'access_token') ctx.claims.role = ctx.roles[0] ?? 'user'
  })
})
