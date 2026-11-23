import { isPlanMatch, mappedGrantsFor } from '../../../../../src/runtime/utils/resolve'

// Stands in for the modules teams works with in a real app:
// - an app answering `teams:owner:resolve` for `operation` (only `opr_summer` exists here; operations is not installed);
// - subscriptions answers `plan` mapping rules (plans are handed out by `POST /api/test/plan`);
// - subscriptions would also enumerate the subscribers of a mapped plan (`teams:members:candidates`). Role holders come
//   from auth's `listRoleHolders`, through the fixture's role provider (`holders`).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:owner:resolve', (ctx) => {
    if (ctx.owner.type !== 'operation') return
    const label = ctx.owner.id ? testOperations.get(ctx.owner.id) : undefined
    ctx.exists = !!label
    if (label) ctx.label = label
  })

  nitro.hooks.hook('teams:roles:resolve', (ctx) => {
    if (testFailingUsers.has(String(ctx.user.id))) {
      // Push first, then throw: teams must drop what a failing listener pushed.
      ctx.grants.push(...mappedGrantsFor(ctx.teams, ctx.rules, ctx.ladders).map(grant => ({ ...grant, role: 'coordinator', priority: 1000 })))
      throw new Error('test: the plan source is down')
    }
    const met = ctx.rules.filter(rule => isPlanMatch(rule.match) && testHoldsPlan(ctx.user.id, rule.match.plan))
    ctx.grants.push(...mappedGrantsFor(ctx.teams, met, ctx.ladders))
  })

  nitro.hooks.hook('teams:members:candidates', (ctx) => {
    const plans = ctx.rules.flatMap(rule => isPlanMatch(rule.match) ? [rule.match.plan] : [])
    for (const id of testPlanHolders(plans)) ctx.userIds.add(id)
  })

  nitro.hooks.hook('teams:member:added', (ctx) => {
    testTeamsHooks.push({ name: 'added', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role })
  })
  nitro.hooks.hook('teams:member:removed', (ctx) => {
    testTeamsHooks.push({ name: 'removed', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role })
  })
  nitro.hooks.hook('teams:member:role-changed', (ctx) => {
    testTeamsHooks.push({ name: 'role-changed', teamId: ctx.team.id, userId: ctx.member.userId, role: ctx.member.role, from: ctx.from, to: ctx.to })
  })
})
