// Stands in for the modules that listen to operations: crew would answer the participation hooks with the operations a
// user works at, and anything may listen to `operations:status-changed`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('operations:participation:resolve', (ctx) => {
    for (const operationId of testParticipationOf(ctx.user.id)) ctx.operationIds.add(operationId)
  })

  nitro.hooks.hook('operations:participants:resolve', (ctx) => {
    for (const userId of testParticipantsOf(ctx.operationIds)) ctx.userIds.add(userId)
  })

  nitro.hooks.hook('operations:status-changed', (ctx) => {
    testStatusChanges.push({ id: ctx.operation.id, from: ctx.from, to: ctx.to })
    testHookLog.push({ name: 'status-changed', id: ctx.operation.id })
  })

  nitro.hooks.hook('operations:created', (ctx) => {
    testHookLog.push({ name: 'created', id: ctx.operation.id })
  })

  nitro.hooks.hook('operations:updated', (ctx) => {
    // `previous` is the state before the edit.
    testHookLog.push({ name: `updated:${ctx.previous.name === ctx.operation.name ? 'same' : 'renamed'}`, id: ctx.operation.id })
  })
})
