import { USER_KEYS } from '~/store/queryKeys'
import { useQuery } from '@pinia/colada'

export const useUserMemberships = ({ isEnabled }: { isEnabled?: MaybeRefOrGetter<boolean> } = {}) => {
  const { $api } = useNuxtApp()

  return useQuery({
    key: () => USER_KEYS.membership,
    query: () => $api('/api/account/memberships'),
    placeholderData: () => [],
    enabled: isEnabled ? () => import.meta.client && toValue(isEnabled) : () => import.meta.client,
  })
}

export const useUserPaymentMethods = () => {
  const { $api } = useNuxtApp()

  return useQuery({
    key: () => USER_KEYS.paymentMethods,
    query: () => $api('/api/account/payment-methods'),
    placeholderData: () => [],
  })
}

export const useUserEventTickets = () => {
  const { $api } = useNuxtApp()
  const { loggedIn } = useUserSession()

  return useQuery({
    key: () => USER_KEYS.eventTickets,
    query: () => {
      return $api('/api/account/events/tickets')
    },
    placeholderData: () => [],
    enabled: () => import.meta.client && loggedIn.value,
  })
}
