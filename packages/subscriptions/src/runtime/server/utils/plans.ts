import type Stripe from 'stripe'
import type { H3Event } from 'h3'
import { kv } from '@nuxthub/kv'
import type { PlanPrice, PlanPriceRef, PlansFilterContext, ResolvedPlan } from '../../../types'

const CACHE_TTL_SECONDS = 60 * 5

const INTERVALS = ['day', 'week', 'month', 'year'] as const

function toPlanPrice(price: Stripe.Price): PlanPrice | null {
  const recurring = price.recurring
  if (!recurring || !INTERVALS.includes(recurring.interval)) return null
  return {
    id: price.id,
    amount: price.unit_amount ?? null,
    currency: price.currency,
    interval: recurring.interval,
    intervalCount: recurring.interval_count ?? 1,
    trialPeriodDays: recurring.trial_period_days ?? null,
    lookupKey: price.lookup_key ?? null,
  }
}

async function fetchPrices(stripe: Stripe, refs: PlanPriceRef[]): Promise<Map<string, Stripe.Price>> {
  const byRef = new Map<string, Stripe.Price>()
  const lookupKeys = refs.filter((ref): ref is { lookupKey: string } => typeof ref !== 'string').map(ref => ref.lookupKey)
  const ids = refs.filter((ref): ref is string => typeof ref === 'string')

  for (let i = 0; i < lookupKeys.length; i += 10) {
    const chunk = lookupKeys.slice(i, i + 10)
    const list = await stripe.prices.list({ lookup_keys: chunk, active: true, limit: 100 })
    for (const price of list.data) {
      if (price.lookup_key) byRef.set(`lookup:${price.lookup_key}`, price)
    }
  }
  for (const id of ids) {
    try {
      byRef.set(`id:${id}`, await stripe.prices.retrieve(id))
    }
    catch (error) {
      console.warn(`[@frigear-nu/subscriptions] Could not load Stripe price "${id}":`, error instanceof Error ? error.message : error)
    }
  }
  return byRef
}

/** The configured plans with their live prices from Stripe, cached in KV for ~5 minutes. Unfiltered. */
export async function getResolvedPlans(): Promise<ResolvedPlan[]> {
  const config = useRuntimeConfig().subscriptions?.plans ?? {}
  const entries = Object.entries(config)
  if (!entries.length) return []

  // The cache key changes with the plan config so editing the config never serves stale plans.
  const cacheKey = `subscriptions:plans:${JSON.stringify(config)}`
  const cached = await kv.get<ResolvedPlan[]>(cacheKey).catch(() => null)
  if (cached) return cached

  const stripe = useStripe()
  const prices = await fetchPrices(stripe, entries.flatMap(([, plan]) => plan.prices))

  const plans: ResolvedPlan[] = entries
    .map(([key, plan]) => {
      const resolved = plan.prices
        .map(ref => prices.get(typeof ref === 'string' ? `id:${ref}` : `lookup:${ref.lookupKey}`))
        .filter((price): price is Stripe.Price => !!price && price.active !== false)
        .map(toPlanPrice)
        .filter((price): price is PlanPrice => price !== null)
      return {
        key,
        label: plan.label ?? key,
        ...(plan.description ? { description: plan.description } : {}),
        rank: plan.rank,
        prices: resolved,
      }
    })
    .sort((a, b) => a.rank - b.rank)

  await kv.set(cacheKey, plans, { ttl: CACHE_TTL_SECONDS }).catch(() => {})
  return plans
}

/** Resolved plans passed through the `subscriptions:plans:filter` policy hook. */
export async function getAvailablePlans(event?: H3Event): Promise<ResolvedPlan[]> {
  const ctx: PlansFilterContext = { event, plans: structuredClone(await getResolvedPlans()) }
  await useNitroApp().hooks.callHook('subscriptions:plans:filter', ctx)
  return ctx.plans
}
