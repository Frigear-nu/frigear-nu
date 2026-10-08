// Runtime subscription: a host app reacting to a Stripe event without building a module.
export default defineNitroPlugin(() => {
  onStripeEvent('checkout.session.completed', (event, { userId }) => {
    console.log(`[playground] checkout ${event.data.object.id} completed (user: ${userId ?? 'unknown'})`)
  })
})
