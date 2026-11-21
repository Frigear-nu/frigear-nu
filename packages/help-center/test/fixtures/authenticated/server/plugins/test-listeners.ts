// Stands in for the modules that answer the audience hooks (teams and crew would fill the viewer and the audiences;
// operations and teams would label their owners) and for whatever listens to the notify hook (the mail driver).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', (ctx) => {
    const state = testViewerOf(ctx.user.id)
    if (!state) return
    ctx.viewer.operationIds.push(...state.operationIds)
    ctx.viewer.teamRoles.push(...state.teamRoles)
    // The `bar` ladder, lowest first.
    ctx.viewer.ladders.bar = ['volunteer', 'bartender', 'lead', 'coordinator']
  })

  nitro.hooks.hook('audience:owner:resolve', (ctx) => {
    const owner = testOwners[ctx.owner.type]
    if (!owner) return
    const known = ctx.owner.id ? owner[ctx.owner.id] : undefined
    ctx.exists = !!known
    if (known) ctx.label = known.name
  })

  nitro.hooks.hook('help-center:audience:resolve', (ctx) => {
    const key = ctx.audience.operationId ?? ctx.audience.teamId
    if (key) ctx.userIds.push(...(testAudiences.get(key) ?? []))
  })

  nitro.hooks.hook('notify:email', (ctx) => {
    testEmails.push(ctx.notification as (typeof testEmails)[number])
  })
})
