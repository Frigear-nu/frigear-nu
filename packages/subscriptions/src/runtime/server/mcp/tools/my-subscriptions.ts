// Self only: Stripe customer and price ids are not exposed, only what the user sees on their membership page.
export default defineScopedMcpTool({
  description: 'List your own subscriptions (plan, status, billing period and whether it cancels at period end) and your active plan.',
  scopes: ['subscriptions:read'],
  annotations: { readOnlyHint: true },
  handler: async (_args, { user }) => {
    const { subscriptions, activePlan } = await listUserSubscriptions(user.id)
    return { activePlan, subscriptions: subscriptions.map(({ priceId: _priceId, ...rest }) => rest) }
  },
})
