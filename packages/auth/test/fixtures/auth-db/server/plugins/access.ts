// The host overrides `tokens.test.ts` exercises: an allowlisted staff user (Eve) may administer events through
// `authorization:before` alone, `x-before` makes every listener vote, and Root is an admin through `authorization:roles`.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('authorization:before', (ctx) => {
    if (ctx.user.id === 5 && ctx.permission === 'events:admin') ctx.allow()
    const vote = getRequestHeader(ctx.event, 'x-before')
    if (vote === 'allow') ctx.allow()
    if (vote === 'deny') ctx.deny()
    if (vote === 'throw') throw new Error('a broken listener')
  })
  nitroApp.hooks.hook('authorization:roles', (ctx) => {
    if ((ctx.user as { email?: string }).email === 'root@example.com') ctx.roles.push('admin')
  })
})
