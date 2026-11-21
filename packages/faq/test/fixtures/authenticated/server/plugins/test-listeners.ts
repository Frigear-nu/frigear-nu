// Stands in for teams, which answers `teams:owner:resolve` for its owner types, and for whatever listens to the FAQ
// hooks (a cache purge, say).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:owner:resolve', (ctx) => {
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
