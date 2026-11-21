// Stands in for the modules that listen to operations: crew would answer `audience:viewer:resolve` with the operations
// a user works at, and anything may listen to `operations:status-changed`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', (ctx) => {
    for (const { operationId, kind } of testParticipationOf(ctx.user.id)) {
      if (kind === 'id') ctx.viewer.operationIds.push(operationId)
      else ctx.viewer.teamRoles.push({ ownerType: 'operation', ownerId: operationId, teamId: `tem_${operationId}`, kind: 'bar', role: 'volunteer', source: kind })
    }
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
