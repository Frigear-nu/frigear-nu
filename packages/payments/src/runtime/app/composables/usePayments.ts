import type { PaymentDto, ResumeResponse } from '../../../types'
import { paymentsApi } from '../../utils'
import { $fetch, computed, navigateTo, useCachedFetch, useUserSession, watch } from '#imports'

/**
 * The signed-in user's payments, plus a helper to resume an unpaid one. Awaitable: `await usePayments()` in a page
 * renders them on the server. `payments` is `[]` until loaded and after an error: check `loading` and `error` first.
 */
export function usePayments() {
  const { loggedIn } = useUserSession()
  // The server knows the visitor from the request's cookie, so the request does not wait for the client-side session.
  const fetched = useCachedFetch<PaymentDto[]>(paymentsApi.me.list, {
    key: 'payments:mine',
    ttl: 60 * 1000,
    watch: false,
  })
  const { status, error, loading, refresh, clear } = fetched

  watch(loggedIn, (value) => {
    if (value) refresh()
    else clear()
  })

  const payments = computed(() => fetched.data.value ?? [])

  async function resume(paymentId: string) {
    const { url } = await $fetch<ResumeResponse>(paymentsApi.me.resume(paymentId), { method: 'POST' })
    await navigateTo(url, { external: true })
  }

  const api = { payments, refresh, status, error, loading, resume }
  return Object.assign(fetched.then(() => api), api)
}
