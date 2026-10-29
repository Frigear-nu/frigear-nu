import { subscriptionsApi } from '../../utils/api'

export interface SubscriptionPlanPrice {
  id: string
  /** Minor units (e.g. cents). */
  amount: number | null
  currency: string
  interval: 'day' | 'week' | 'month' | 'year'
  intervalCount: number
  trialPeriodDays: number | null
  lookupKey: string | null
}

export interface SubscriptionPlan {
  key: string
  label: string
  description?: string
  rank: number
  features?: string[]
  prices: SubscriptionPlanPrice[]
}

export type PlansResponse = { plans: SubscriptionPlan[] }

/** Matches the server-side KV cache (`CACHE_TTL_SECONDS`), so a client-side hit is never older than the server's own. */
export const PLANS_CLIENT_CACHE_MS = 5 * 60 * 1000

/** The `useCachedFetch` key of the plans. */
export const PLANS_KEY = 'subscriptions:plans'

/** The plans, sorted by rank. Awaitable, like `useSubscription`. */
export const usePlans = () => {
  // `useCachedFetch` keeps the plans across navigation, so going back to the pricing table does not blank it.
  const fetched = useCachedFetch<PlansResponse>(subscriptionsApi.plans, {
    key: PLANS_KEY,
    ttl: PLANS_CLIENT_CACHE_MS,
  })
  const { data, status, error, loading, refresh } = fetched

  const plans = computed<SubscriptionPlan[]>(() =>
    [...(data.value?.plans ?? [])].sort((a, b) => a.rank - b.rank),
  )

  const api = { plans, status, error, loading, refresh }
  return Object.assign(fetched.then(() => api), api)
}
