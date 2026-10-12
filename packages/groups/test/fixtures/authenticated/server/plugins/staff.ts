// Test-only host policy: anybody with an `@staff.test` email manages groups and documents.
export default defineNitroPlugin((nitro) => {
  for (const hook of ['groups:authorize', 'documents:authorize'] as const) {
    nitro.hooks.hook(hook, async (ctx) => {
      const { user } = await getUserSession(ctx.event)
      ctx.allowed = Boolean(user?.email?.endsWith('@staff.test'))
    })
  }
})
