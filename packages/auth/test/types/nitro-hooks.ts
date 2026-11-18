// Auth's Nitro runtime hooks type-check in a host's server code without casts (`pnpm test:types`).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    if (ctx.user && !ctx.roles.includes('admin')) ctx.roles.push('admin')
  })
  nitro.hooks.hook('authorization:before', (ctx) => {
    if (ctx.permission === 'example:never') ctx.deny()
  })
  nitro.hooks.hook('auth:email', (ctx) => {
    ctx.notification.subject = `[Example] ${ctx.notification.subject}`
  })
  nitro.hooks.hook('auth:credentials:changed', ctx => void ctx.reason)
})
