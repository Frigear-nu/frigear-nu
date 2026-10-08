import type { PaymentDto } from '../../../types'

/** The signed-in user's payments, plus a helper to resume an unpaid one. */
export function usePayments() {
  const { loggedIn } = useUserSession()
  const { data, refresh, status } = useFetch<PaymentDto[]>('/api/payments', {
    key: 'payments:mine',
    immediate: loggedIn.value,
    watch: false,
    default: () => [],
  })

  async function resume(paymentId: string) {
    const { url } = await $fetch<{ url: string }>('/api/payments/resume', { method: 'POST', body: { paymentId } })
    await navigateTo(url, { external: true })
  }

  return { payments: data, refresh, status, resume }
}
