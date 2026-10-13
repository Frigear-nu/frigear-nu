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

type PlansResponse = { plans: SubscriptionPlan[] }

/** Matches the server-side KV cache (`CACHE_TTL_SECONDS`), so a client-side hit is never older than the server's own. */
const CLIENT_CACHE_MS = 5 * 60 * 1000

export const usePlans = () => {
  // Nuxt purges `useFetch` data once the last component using the key unmounts, so navigating away and back would
  // blank the table and refetch. `useState` survives navigation and is carried over from the server render.
  const cache = useState<{ at: number, data: PlansResponse } | null>('subscriptions:plans:cache', () => null)

  const { data, status, error, refresh } = useFetch<PlansResponse>('/api/subscriptions/plans', {
    key: 'subscriptions:plans',
    default: () => ({ plans: [] }),
    getCachedData: (_key, _nuxtApp, ctx) =>
      ctx.cause !== 'refresh:manual' && cache.value && Date.now() - cache.value.at < CLIENT_CACHE_MS ? cache.value.data : undefined,
    transform: (response) => {
      cache.value = { at: Date.now(), data: response }
      return response
    },
  })

  const plans = computed<SubscriptionPlan[]>(() =>
    [...(data.value?.plans ?? [])].sort((a, b) => a.rank - b.rank),
  )

  return { plans, status, error, refresh }
}
