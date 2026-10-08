import type { MaybeRefOrGetter } from 'vue'

export interface UserSubscription {
  id: string
  planKey: string | null
  priceId: string
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  endedAt: string | null
}

interface MeResponse {
  subscriptions: UserSubscription[]
  activePlan: string | null
}

type CheckoutResponse = { url: string } | { updated: true, kind: 'upgrade' | 'downgrade' }

const ACTIVE_STATUSES = ['active', 'trialing']

export const useSubscription = () => {
  const { loggedIn } = useUserSession()
  const pending = ref(false)
  const error = ref<string | null>(null)

  const { data, status, refresh } = useFetch<MeResponse>('/api/subscriptions/me', {
    key: 'subscriptions:me',
    default: () => ({ subscriptions: [], activePlan: null }),
    immediate: loggedIn.value,
    watch: false,
  })

  watch(loggedIn, (value) => {
    if (value) refresh()
    else data.value = { subscriptions: [], activePlan: null }
  })

  const subscription = computed<UserSubscription | null>(() => {
    const list = data.value?.subscriptions ?? []
    return list.find(item => ACTIVE_STATUSES.includes(item.status)) ?? null
  })
  const plan = computed(() => data.value?.activePlan ?? subscription.value?.planKey ?? null)
  const isActive = computed(() => subscription.value !== null)
  const cancelsAt = computed(() =>
    subscription.value?.cancelAtPeriodEnd ? subscription.value.currentPeriodEnd : null,
  )

  function has(planKey: MaybeRefOrGetter<string>) {
    return isActive.value && plan.value === toValue(planKey)
  }

  async function run<T>(request: () => Promise<T>, fallback: string): Promise<T> {
    pending.value = true
    error.value = null
    try {
      return await request()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : fallback
      throw err
    }
    finally {
      pending.value = false
    }
  }

  /** Start checkout for a plan key or a price id (price ids start with `price_`). Redirects or updates in place. */
  function subscribe(planKeyOrPriceId: string, options: { successUrl?: string, cancelUrl?: string } = {}) {
    const isPrice = planKeyOrPriceId.startsWith('price_')
    const config = useRuntimeConfig().public.subscriptions as { pages?: { success?: string, cancel?: string } } | undefined
    const origin = import.meta.client ? window.location.origin : ''
    const absolute = (path?: string) => (path ? `${origin}${path}` : undefined)

    return run(async () => {
      const result = await $fetch<CheckoutResponse>('/api/subscriptions/checkout', {
        method: 'POST',
        body: {
          ...(isPrice ? { priceId: planKeyOrPriceId } : { planKey: planKeyOrPriceId }),
          successUrl: options.successUrl ?? absolute(config?.pages?.success),
          cancelUrl: options.cancelUrl ?? absolute(config?.pages?.cancel),
        },
      })
      if ('url' in result) {
        await navigateTo(result.url, { external: true })
      }
      else {
        await refresh()
      }
      return result
    }, 'Failed to start checkout.')
  }

  function openPortal(returnUrl?: string) {
    return run(async () => {
      const { url } = await $fetch<{ url: string }>('/api/subscriptions/portal', {
        method: 'POST',
        body: { returnUrl: returnUrl ?? (import.meta.client ? window.location.href : undefined) },
      })
      await navigateTo(url, { external: true })
    }, 'Failed to open the billing portal.')
  }

  return { subscription, plan, status, isActive, cancelsAt, has, pending, error, refresh, subscribe, openPortal }
}

/** Optional-i18n label resolver: uses `subscriptions.<key>` from @nuxtjs/i18n when present, else `labels`, else English. */
export const useSubscriptionLabels = <T extends Record<string, string>>(
  defaults: T,
  overrides?: MaybeRefOrGetter<Partial<T> | undefined>,
) => {
  const i18n = useNuxtApp().$i18n as { t: (key: string, params?: Record<string, unknown>) => string, te?: (key: string) => boolean } | undefined

  return (key: keyof T & string, params: Record<string, string | number> = {}): string => {
    const override = toValue(overrides)?.[key]
    let text: string = override ?? defaults[key]!
    if (!override && i18n?.te?.(`subscriptions.${key}`)) {
      return i18n.t(`subscriptions.${key}`, params)
    }
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
}
