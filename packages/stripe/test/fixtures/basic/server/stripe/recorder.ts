import { defineStripeEventHandler } from '../../../../../src/runtime/utils'
import { record } from './record'

export default defineStripeEventHandler<'customer.subscription.updated' | 'customer.created'>((event, ctx) => {
  record({ handler: 'registered', type: event.type, id: event.id, userId: ctx.userId })
})
