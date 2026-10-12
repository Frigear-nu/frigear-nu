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

export const usePlans = () => {
  const { data, status, error, refresh } = useFetch<{ plans: SubscriptionPlan[] }>('/api/subscriptions/plans', {
    key: 'subscriptions:plans',
    default: () => ({ plans: [] }),
  })

  const plans = computed<SubscriptionPlan[]>(() =>
    [...(data.value?.plans ?? [])].sort((a, b) => a.rank - b.rank),
  )

  return { plans, status, error, refresh }
}
