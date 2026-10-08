import { defineStripeEventHandler } from '../../../../../src/runtime/utils'
import { record } from './record'

export default defineStripeEventHandler<'invoice.payment_failed'>((event, ctx) => {
  record({ handler: 'failing', type: event.type, id: event.id, userId: ctx.userId })
  throw new Error('boom')
})
