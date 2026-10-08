// Test-only host policy: anybody with an `@staff.test` email manages events.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('events:authorize', async (ctx) => {
    const { user } = await getUserSession(ctx.event)
    ctx.allowed = Boolean(user?.email?.endsWith('@staff.test'))
  })
})
