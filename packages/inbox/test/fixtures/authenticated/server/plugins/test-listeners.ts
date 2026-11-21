// Stands in for the modules around the inbox: teams answers `audience:owner:resolve` for teams and says who leads them,
// and a mail driver listens to notify. Every inbox hook is recorded.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:owner:resolve', (ctx) => {
    if (ctx.owner.type !== 'team') return
    ctx.exists = ctx.owner.id === 'tem_known'
    if (ctx.exists) ctx.label = 'Known team'
  })
  setInboxTeamLeadResolver(async (_event, userId, teamId) => testLeads.get(String(userId))?.has(teamId) ?? false)

  nitro.hooks.hook('notify:email', (ctx) => {
    testEmails.push(ctx.notification as (typeof testEmails)[number])
  })

  nitro.hooks.hook('inbox:message:received', (ctx) => {
    testInboxHooks.push({ name: 'message:received', threadId: ctx.thread.id, messageId: ctx.message.id })
  })
  nitro.hooks.hook('inbox:message:sent', (ctx) => {
    testInboxHooks.push({ name: 'message:sent', threadId: ctx.thread.id, messageId: ctx.message.id })
  })
  nitro.hooks.hook('inbox:thread:assigned', (ctx) => {
    testInboxHooks.push({ name: 'thread:assigned', threadId: ctx.thread.id, data: { assigneeId: ctx.assigneeId, previous: ctx.previous } })
  })
  nitro.hooks.hook('inbox:thread:status-changed', (ctx) => {
    testInboxHooks.push({ name: 'thread:status-changed', threadId: ctx.thread.id, data: { from: ctx.from, to: ctx.to } })
  })
})
