import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { registerStripeEventHandler } from '../../../../src/runtime/utils'

export default defineNuxtModule({
  meta: { name: 'fixture-stripe-handlers' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerStripeEventHandler(nuxt, {
      events: ['customer.subscription.updated', 'customer.created'],
      handler: resolver.resolve('../server/stripe/recorder'),
    })
    registerStripeEventHandler(nuxt, {
      events: '*',
      handler: resolver.resolve('../server/stripe/catch-all'),
      order: 200,
    })
    registerStripeEventHandler(nuxt, {
      events: ['invoice.payment_failed'],
      handler: resolver.resolve('../server/stripe/failing'),
    })
  },
})
