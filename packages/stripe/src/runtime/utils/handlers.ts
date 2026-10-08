import type { Nuxt } from '@nuxt/schema'
import type { RegisteredStripeEventHandler, StripeEventHandler, StripeEventType } from '../../types'

export type RegisterStripeEventHandlerOptions = RegisteredStripeEventHandler

/**
 * A typed identity helper for authoring a Stripe event handler file. The event is narrowed to the
 * event type(s) given as the generic; the default export of the file is the handler.
 *
 * ```ts
 * export default defineStripeEventHandler<'customer.subscription.updated' | 'customer.subscription.deleted'>(
 *   async (event, { stripe, userId }) => {
 *     const subscription = event.data.object
 *   },
 * )
 * ```
 *
 * Handlers must be idempotent: if any handler for an event throws, the webhook answers 5xx and
 * Stripe retries the whole event.
 */
export function defineStripeEventHandler<T extends StripeEventType = StripeEventType>(
  handler: StripeEventHandler<T>,
): StripeEventHandler {
  return handler as unknown as StripeEventHandler
}

/**
 * Build-time API for any module (or host app module) to subscribe to Stripe webhook events. Call it
 * during `setup()`; registration order between modules doesn't matter, since handlers are only
 * bundled once every module has finished setting up. `handler` must be an absolute path.
 *
 * ```ts
 * registerStripeEventHandler(nuxt, {
 *   events: ['customer.subscription.updated', 'checkout.session.completed'],
 *   handler: resolver.resolve('./runtime/server/stripe/subscription-events'),
 * })
 * ```
 */
export function registerStripeEventHandler(nuxt: Nuxt, options: RegisterStripeEventHandlerOptions): void {
  nuxt.options.stripe ||= {}

  const handlers: RegisteredStripeEventHandler[] = Array.isArray(nuxt.options.stripe._handlers)
    ? nuxt.options.stripe._handlers
    : []
  nuxt.options.stripe._handlers = handlers

  const events = options.events === '*' ? '*' : [...options.events]
  const exists = handlers.some(existing =>
    existing.handler === options.handler
    && JSON.stringify(existing.events) === JSON.stringify(events),
  )
  if (!exists) {
    handlers.push({ events, handler: options.handler, order: options.order })
  }
}
