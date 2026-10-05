import { ROOT_KEYS } from '../queryKeys'
import { useQuery } from '@pinia/colada'
import type { PublicPrice } from '#shared/types/membership'

export const useMemberships = () => {
  const { $api } = useNuxtApp()

  return useQuery({
    key: () => ROOT_KEYS.memberships,
    query: async () => {
      return $api<PublicPrice[]>('/api/memberships')
    },
    // in ms
    staleTime: 30000,
  })
}
