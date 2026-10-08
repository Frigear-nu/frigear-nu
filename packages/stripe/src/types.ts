import type Stripe from 'stripe'
import type { H3Event } from 'h3'

export type ModuleOptions = {
  settings?: {
    /** Path the Stripe webhook is served on. Defaults to `/api/stripe/webhook`. */
    webhookPath?: string
  }
}

/** Private runtime config (`useRuntimeConfig().stripe`), set through `NUXT_STRIPE_*` env vars. */
export type StripeRuntimeConfig = {
  secretKey: string
  webhookSecret: string
  apiVersion: string
}

/** Public runtime config (`useRuntimeConfig().public.stripe`). */
export type StripePublicRuntimeConfig = {
  publishableKey: string
}

/** Every Stripe event type string, e.g. `'customer.subscription.updated'`. */
export type StripeEventType = Stripe.Event['type']

/** The `Stripe.Event` for a given event type (or union of event types). */
export type StripeEventOf<T extends StripeEventType = StripeEventType> = Extract<Stripe.Event, { type: T }>

export type StripeEventHandlerContext = {
  /** A ready-to-use Stripe SDK instance (see `useStripe`). */
  stripe: Stripe
  /** The local user owning the event's Stripe customer, or `null` if there is none / it is unknown. */
  userId: number | null
  /** The Nitro request event of the webhook call. */
  event: H3Event
}

export type StripeEventHandler<T extends StripeEventType = StripeEventType> = (
  event: StripeEventOf<T>,
  ctx: StripeEventHandlerContext,
) => void | Promise<void>

/** A handler registered at build time through `registerStripeEventHandler`. */
export type RegisteredStripeEventHandler = {
  /** Event types to subscribe to, or `'*'` for every event. */
  events: string[] | '*'
  /** Absolute path to a file whose default export is a `defineStripeEventHandler(...)` result. */
  handler: string
  /** Lower runs first. Defaults to `100`. */
  order?: number
}
