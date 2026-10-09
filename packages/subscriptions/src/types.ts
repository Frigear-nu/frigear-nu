import type Stripe from 'stripe'
import type { H3Event } from 'h3'

/** A price of a plan: either a Stripe price id, or a lookup key resolved through Stripe. */
export type PlanPriceRef = string | { lookupKey: string }

export type PlanConfig = {
  /** Stripe prices belonging to this plan (e.g. monthly + yearly). */
  prices: PlanPriceRef[]
  /** Display label. Plain text, used as the fallback. The UI prefers `subscriptions.catalog.<planKey>.label` from i18n when defined. */
  label?: string
  description?: string
  /** Drives upgrade vs. downgrade: a higher rank is a higher tier. */
  rank: number
}

export type ModuleOptions = {
  /** Plans keyed by plan key. Leave empty to use the module as "any active subscription". */
  plans?: Record<string, PlanConfig>
  settings?: {
    // Each page accepts a custom path (string), `true` for the default path, or `false`/omitted to
    // disable it. Enabling a page requires `@nuxt/ui` in the consuming app.
    pages?: {
      /** Default `/account/membership`. */
      membership?: string | boolean
      /** Default `/account/membership/success`. */
      success?: string | boolean
      /** Default `/account/membership/cancel`. */
      cancel?: string | boolean
    }
    /** Hint for the UI: let customers change plan in the Stripe billing portal instead of in-app. */
    allowChangeInPortal?: boolean
  }
}

export type PublicPlan = {
  key: string
  label: string
  description?: string
  rank: number
}

/** Exposed as `useRuntimeConfig().public.subscriptions`. */
export type PublicModuleOptions = {
  pages: {
    membership?: string
    success?: string
    cancel?: string
  }
  plans: PublicPlan[]
  allowChangeInPortal: boolean
}

/** Private server runtime config (`useRuntimeConfig().subscriptions`). */
export type SubscriptionsRuntimeConfig = {
  plans: Record<string, { prices: PlanPriceRef[], label?: string, description?: string, rank: number }>
}

export type PlanPrice = {
  id: string
  amount: number | null
  currency: string
  interval: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
  trialPeriodDays: number | null
  lookupKey: string | null
}

export type ResolvedPlan = PublicPlan & { prices: PlanPrice[] }

export type PlansResponse = { plans: ResolvedPlan[] }

export type SubscriptionDto = {
  id: string
  planKey: string | null
  priceId: string
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  endedAt: string | null
}

export type MeResponse = {
  subscriptions: SubscriptionDto[]
  activePlan: string | null
}

export type CheckoutBody = {
  planKey?: string
  priceId?: string
  successUrl?: string
  cancelUrl?: string
}

export type CheckoutResponse = { url: string } | { updated: true, kind: 'upgrade' | 'downgrade' }

export type PortalBody = { returnUrl?: string }

/** Fired before a checkout / plan change. Throw (e.g. `createError`) to deny; mutate `params` to adjust. */
export type CheckoutBeforeContext = {
  event: H3Event
  userId: number
  /** The plan the user is moving to, or `null` when the price isn't part of a configured plan. */
  planKey: string | null
  priceId: string
  /** `checkout` = new subscription, otherwise a change of an existing one. */
  kind: 'checkout' | 'upgrade' | 'downgrade'
  /**
   * Parameters for `stripe.checkout.sessions.create` (only used when `kind === 'checkout'`). Adjust
   * them in place to add promo codes, tax, trials, metadata, ...
   */
  params: Stripe.Checkout.SessionCreateParams
}

export type PlansFilterContext = {
  /** The request, or `undefined` when computed outside a request. */
  event: H3Event | undefined
  /** The plans about to be returned. Mutate or reassign `plans` to hide / reorder them. */
  plans: ResolvedPlan[]
}
