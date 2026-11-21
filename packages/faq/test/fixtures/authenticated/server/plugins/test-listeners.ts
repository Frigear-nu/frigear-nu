// Stands in for the modules that answer the audience hooks (teams and crew would fill the viewer; operations and teams
// would label their owners) and for whatever listens to the FAQ hooks (a cache purge, say).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', (ctx) => {
    const state = testViewerOf(ctx.user.id)
    if (!state) return
    ctx.viewer.operationIds.push(...state.operationIds)
    ctx.viewer.teamRoles.push(...state.teamRoles)
    // The `bar` ladder, lowest first.
    ctx.viewer.ladders.bar = ['volunteer', 'bartender', 'ba', 'coordinator']
  })

  nitro.hooks.hook('audience:owner:resolve', (ctx) => {
    const owner = testOwners[ctx.owner.type]
    if (!owner) return
    const known = ctx.owner.id ? owner[ctx.owner.id] : undefined
    ctx.exists = !!known
    if (known) ctx.label = known.name
  })

  nitro.hooks.hook('faq:group:updated', (ctx) => {
    testHookLog.push({ name: 'group:updated', groupId: ctx.group.id, publishedCount: ctx.group.publishedCount })
  })

  nitro.hooks.hook('faq:item:published', (ctx) => {
    testHookLog.push({ name: 'item:published', groupId: ctx.group.id, itemId: ctx.item.id })
  })
})
