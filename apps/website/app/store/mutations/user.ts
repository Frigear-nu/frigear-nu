import { USER_KEYS } from '~/store/queryKeys'
import { useMutation } from '@pinia/colada'

export const useSubscribeUser = () => {
  const { $api } = useNuxtApp()
  const cache = useQueryCache()
  return useMutation({
    key: () => USER_KEYS.membership,
    mutation: (priceId: string) => $api('/api/account/membership', {
      method: 'POST',
      body: { priceId },
    }),
    async onSettled() {
      await cache.invalidateQueries({ key: USER_KEYS.membership })
      await cache.invalidateQueries({ key: USER_KEYS.paymentMethods })
    },
  })
}

export const useStripeBillingPortalUrl = () => {
  const { $api } = useNuxtApp()
  const { locale } = useSiteI18n()

  return useMutation({
    key: () => USER_KEYS.paymentMethods,
    mutation: () => $api('/api/account/payment-method', {
      method: 'POST',
      body: {
        locale: locale.value,
      },
    }),
  })
}
