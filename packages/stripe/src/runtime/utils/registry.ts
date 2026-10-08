import type { StripeEventHandler, StripeEventType } from '../../types'

export type RuntimeStripeEventHandler = {
  events: string[] | '*'
  handler: StripeEventHandler
}

const handlers: RuntimeStripeEventHandler[] = []

/**
 * Runtime counterpart of `registerStripeEventHandler`, for Nitro plugins in host apps:
 *
 * ```ts
 * // server/plugins/stripe.ts
 * export default defineNitroPlugin(() => {
 *   onStripeEvent('invoice.payment_failed', (event, ctx) => { ... })
 * })
 * ```
 */
export function onStripeEvent<T extends StripeEventType>(
  type: T | T[] | '*',
  handler: StripeEventHandler<T>,
): void {
  handlers.push({
    events: type === '*' ? '*' : Array.isArray(type) ? type : [type],
    handler: handler as unknown as StripeEventHandler,
  })
}

/** Handlers registered through `onStripeEvent`, in registration order. Internal: used by the webhook route. */
export function getRuntimeStripeEventHandlers(): readonly RuntimeStripeEventHandler[] {
  return handlers
}
