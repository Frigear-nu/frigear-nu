import { PLANS_CLIENT_CACHE_MS, PLANS_KEY } from '../composables/usePlans'
import type { PlansResponse } from '../composables/usePlans'

/**
 * Pre-loads the plans once the app is interactive, so the first client-side navigation to a page with the pricing
 * table (from a page that never fetched them) renders instantly instead of waiting for a round trip. The response
 * goes into the `useCachedFetch` cache that `usePlans` reads from.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const cached = useCachedFetchStore().value[PLANS_KEY]
    if (cached && Date.now() - cached.at < PLANS_CLIENT_CACHE_MS) return

    const warm = () => $fetch<PlansResponse>('/api/subscriptions/plans')
      .then(data => nuxtApp.runWithContext(() => primeCachedFetch(PLANS_KEY, data)))
      .catch(() => undefined)

    if ('requestIdleCallback' in window) window.requestIdleCallback(() => void warm())
    else setTimeout(() => void warm(), 1000)
  })
})
