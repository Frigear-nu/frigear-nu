// Stands in for the modules that listen to operations: crew would answer `audience:viewer:resolve` with the operations
// a user works at, and anything may listen to `operations:status-changed`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', (ctx) => {
    ctx.viewer.operationIds.push(...testParticipationOf(ctx.user.id))
  })

  nitro.hooks.hook('operations:status-changed', (ctx) => {
    testStatusChanges.push({ id: ctx.operation.id, from: ctx.from, to: ctx.to })
  })
})
