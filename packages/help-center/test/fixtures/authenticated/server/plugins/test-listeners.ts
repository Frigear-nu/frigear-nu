// Stands in for teams, which answers `teams:owner:resolve` for its owner types, and for whatever listens to the notify
// hook (the mail driver). Who takes part in an operation is the fixture's own `operation` grant kind (`grants/`).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:owner:resolve', (ctx) => {
    const owner = testOwners[ctx.owner.type]
    if (!owner) return
    const known = ctx.owner.id ? owner[ctx.owner.id] : undefined
    ctx.exists = !!known
    if (known) ctx.label = known.name
  })

  nitro.hooks.hook('notify:email', (ctx) => {
    testEmails.push(ctx.notification as (typeof testEmails)[number])
  })
})
