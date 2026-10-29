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
  /** Bullet points shown on the plan card. The UI prefers `subscriptions.catalog.<planKey>.features` (array) from i18n. */
  features?: string[]
  /** Hide the plan during date windows (existing subscribers still see it). */
  availability?: PlanAvailability
}

/** Dates are anything `new Date()` parses; `{fullYear}` is replaced with the current year (e.g. `{fullYear}-06-01`). */
export type PlanDisabledRange = { from: string, to: string }

export type PlanAvailability = {
  /** The plan is hidden for new subscribers while today falls within any of these ranges (inclusive). */
  disabledRanges?: PlanDisabledRange[]
}

export type ModuleOptions = {
  /** Plans keyed by plan key. Leave empty to use the module as "any active subscription". */
  plans?: Record<string, PlanConfig>
  settings?: {
    // Expose this module's MCP tools, resources and prompts on the MCP endpoint. Defaults to `false`.
    mcp?: boolean
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
  features?: string[]
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
  plans: Record<string, { prices: PlanPriceRef[], label?: string, description?: string, rank: number, features?: string[], availability?: PlanAvailability }>
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
  /** `manual` for free grants made by staff. */
  source?: 'stripe' | 'manual'
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

export type CheckoutResponse = { url: string } | { updated: true, kind: 'upgrade' | 'downgrade' | 'resume' }

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

/** `GET /api/admin/users/:id/membership` (staff). */
export type AdminMembershipResponse = {
  plans: Array<{ key: string, label: string, rank: number }>
  current: {
    id: string
    planKey: string | null
    status: string
    source: 'stripe' | 'manual'
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
}

/** `POST /api/admin/users/:id/membership/payment-link` (staff). */
export type AdminPaymentLinkResponse = { url: string, emailed: boolean }

/**
 * A membership invoice announced through the `subscriptions:invoice` hook (only when `@frigear-nu/payments` is
 * installed, which stores it as a payment with `referenceType` `subscription`).
 */
export type InvoicePaymentEvent = {
  userId: number
  invoiceId: string
  status: 'paid' | 'failed' | 'expired'
  /** Total in the currency's minor unit. */
  amount: number
  currency: string
  description: string | null
  referenceType: 'subscription'
  /** The Stripe subscription id. */
  referenceId: string
  paymentIntentId: string | null
  paidAt: Date | null
  createdAt: Date
}
