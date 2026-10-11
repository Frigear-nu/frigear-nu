// Test wiring of `@frigear-nu/subscriptions` into `@frigear-nu/events`: a subscription plan is a membership, and holding one
// means having an active subscription to it. Neither module knows about the other; this plugin is the glue, so any
// other source of memberships could be plugged in the same way.
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
