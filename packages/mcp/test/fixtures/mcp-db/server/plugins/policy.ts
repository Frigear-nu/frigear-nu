// Host policy: only user 3 may manage notes. Identify the caller from ctx.userId.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('notes:authorize' as never, ((ctx: { userId: number, allowed: boolean }) => {
    ctx.allowed = ctx.userId === 3
  }) as never)
})
