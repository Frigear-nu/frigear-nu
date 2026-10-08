import { defineStripeEventHandler } from '../../../../../src/runtime/utils'
import { record } from './record'

export default defineStripeEventHandler((event, ctx) => {
  record({ handler: 'catch-all', type: event.type, id: event.id, userId: ctx.userId })
})
