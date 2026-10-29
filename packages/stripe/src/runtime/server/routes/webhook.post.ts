import Stripe from 'stripe'
import { kv } from '@nuxthub/kv'
import { handlers as registeredHandlers } from '#stripe/handlers'
import { getRuntimeStripeEventHandlers } from '../../utils/registry'
import { apiError, badRequest, notConfigured } from '@frigear-nu/module-kit/server'
import type { StripeEventHandler, StripeEventHandlerContext } from '../../../types'

const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 7
const DEFAULT_ORDER = 100

type Dispatchable = { events: string[] | '*', order: number, handler: StripeEventHandler }

const matches = (events: string[] | '*', type: string) => events === '*' || events.includes(type)

function collectHandlers(type: string): StripeEventHandler[] {
  const all: Dispatchable[] = [
    ...registeredHandlers.map(entry => ({ events: entry.events, order: entry.order ?? DEFAULT_ORDER, handler: entry.handler })),
    ...getRuntimeStripeEventHandlers().map(entry => ({ events: entry.events, order: DEFAULT_ORDER, handler: entry.handler })),
  ]
  // Array.prototype.sort is stable, so equal orders keep registration order.
  return all
    .filter(entry => matches(entry.events, type))
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.handler)
}

/** Best-effort extraction of the Stripe customer id an event is about. */
function getEventCustomerId(stripeEvent: Stripe.Event): string | null {
  const object = stripeEvent.data.object as unknown as Record<string, unknown> | undefined
  if (!object) return null
  if (object.object === 'customer' && typeof object.id === 'string') return object.id
  const customer = object.customer
  if (typeof customer === 'string') return customer
  if (customer && typeof customer === 'object' && typeof (customer as { id?: unknown }).id === 'string') {
    return (customer as { id: string }).id
  }
  return null
}

export default defineEventHandler(async (event) => {
  const { webhookSecret } = useRuntimeConfig(event).stripe
  if (!webhookSecret) {
    throw notConfigured('Stripe webhook is not configured (missing NUXT_STRIPE_WEBHOOK_SECRET).')
  }

  const signature = getHeader(event, 'stripe-signature')
  if (!signature) {
    throw badRequest('Missing stripe-signature header.')
  }

  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw badRequest('Missing request body.')
  }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = await Stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    )
  }
  catch (error) {
    console.warn('[@frigear-nu/stripe] Rejected webhook with an invalid signature:', error instanceof Error ? error.message : error)
    throw badRequest('Invalid Stripe signature.')
  }

  const processedKey = `stripe:event:${stripeEvent.id}`
  if (await kv.has(processedKey)) {
    return { received: true, duplicate: true }
  }

  const customerId = getEventCustomerId(stripeEvent)
  const user = customerId ? await getStripeCustomerUser(customerId) : null
  const context: StripeEventHandlerContext = {
    stripe: useStripe(),
    userId: user?.id ?? null,
    event,
  }

  let failures = 0
  for (const handler of collectHandlers(stripeEvent.type)) {
    try {
      await handler(stripeEvent as never, context)
    }
    catch (error) {
      failures++
      console.error(`[@frigear-nu/stripe] Handler failed for "${stripeEvent.type}" (${stripeEvent.id}):`, error)
    }
  }

  try {
    await useNitroApp().hooks.callHook('stripe:event', stripeEvent, context)
  }
  catch (error) {
    console.error(`[@frigear-nu/stripe] "stripe:event" hook failed for ${stripeEvent.id}:`, error)
  }

  if (failures > 0) {
    // Not marked as processed, so Stripe's retry re-runs every handler (they must be idempotent).
    throw apiError(500, 'handler_failed', `${failures} Stripe event handler(s) failed.`)
  }

  await kv.set(processedKey, Date.now(), { ttl: PROCESSED_TTL_SECONDS })

  return { received: true }
})
