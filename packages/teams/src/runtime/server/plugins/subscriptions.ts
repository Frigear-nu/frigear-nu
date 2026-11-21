import { hasActiveSubscription } from '@frigear-nu/subscriptions/utils'
import { isPlanMatch, mappedGrantsFor } from '../../utils/resolve'

// Answers the `plan` mapping rules: a user with an active subscription to the plan holds the rule's team role. Only
// registered when `@frigear-nu/subscriptions` is installed (see `module.ts`); without it, plan rules give nobody a role.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('teams:roles:resolve', async (ctx) => {
    const rules = ctx.rules.filter(rule => isPlanMatch(rule.match))
    if (!rules.length) return
    const held = new Map<string, boolean>()
    const met = []
    for (const rule of rules) {
      const plan = (rule.match as { plan: string }).plan
      if (!held.has(plan)) held.set(plan, await hasActiveSubscription(Number(ctx.user.id), { plans: [plan] }))
      if (held.get(plan)) met.push(rule)
    }
    ctx.grants.push(...mappedGrantsFor(ctx.teams, met, ctx.ladders))
  })
})
