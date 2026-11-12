// Test-only policy hooks driven by request headers / query.
export default defineNitroPlugin((nitro) => {
  // Staff: a request with the `x-staff` header may do anything its credential allows (users admin, membership routes).
  nitro.hooks.hook('authorization:before', (ctx) => {
    if (getHeader(ctx.event, 'x-staff')) ctx.allow()
  })

  nitro.hooks.hook('subscriptions:plans:filter', (ctx) => {
    const hide = ctx.event ? getQuery(ctx.event).hide : undefined
    if (hide) ctx.plans = ctx.plans.filter(plan => plan.key !== hide)
    else ctx.plans = ctx.plans.filter(plan => plan.key !== 'secret')
  })

  nitro.hooks.hook('subscriptions:checkout:before', (ctx) => {
    if (getHeader(ctx.event, 'x-deny')) {
      throw createError({ statusCode: 403, statusMessage: 'Checkout is closed.' })
    }
    if (getHeader(ctx.event, 'x-trial') && ctx.kind === 'checkout') {
      ctx.params.subscription_data = { ...ctx.params.subscription_data, trial_period_days: 7 }
    }
  })
})
