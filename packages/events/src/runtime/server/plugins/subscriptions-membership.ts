import { hasActiveSubscription } from '@frigear-nu/subscriptions/utils'

// The default membership provider: a `@frigear-nu/subscriptions` plan is a membership, and holding it means having an
// active subscription to it. Only registered when subscriptions is installed (see `module.ts`); any other source of
// memberships answers the same `events:membership:*` hooks from its own plugin.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('events:membership:check', async (ctx) => {
    if (await hasActiveSubscription(ctx.userId, ctx.requirement === 'any' ? {} : { plans: ctx.requirement })) ctx.satisfied = true
  })

  nitro.hooks.hook('events:membership:options', (ctx) => {
    const plans = Object.entries(useRuntimeConfig().subscriptions?.plans ?? {}).sort(([, a], [, b]) => a.rank - b.rank)
    ctx.available = true
    ctx.options.push(...plans.map(([key, plan]) => ({ value: key, label: plan.label ?? key })))
  })
})
