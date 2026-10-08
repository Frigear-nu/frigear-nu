import { record } from '../stripe/record'

export default defineNitroPlugin(() => {
  onStripeEvent('customer.subscription.updated', (event, ctx) => {
    record({ handler: 'runtime', type: event.type, id: event.id, userId: ctx.userId })
  })
})
