import { PLANS_CLIENT_CACHE_MS, usePlansCache } from '../composables/usePlans'
import type { PlansResponse } from '../composables/usePlans'

/**
 * Pre-loads the plans once the app is interactive, so the first client-side navigation to a page with the pricing
 * table (from a page that never fetched them) renders instantly instead of waiting for a round trip.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const cache = usePlansCache()
    if (cache.value && Date.now() - cache.value.at < PLANS_CLIENT_CACHE_MS) return

    const warm = () => $fetch<PlansResponse>('/api/subscriptions/plans')
      .then((data) => { cache.value = { at: Date.now(), data } })
      .catch(() => undefined)

    if ('requestIdleCallback' in window) window.requestIdleCallback(() => void warm())
    else setTimeout(() => void warm(), 1000)
  })
})
