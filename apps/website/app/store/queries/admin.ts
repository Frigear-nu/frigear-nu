import { ADMIN_KEYS } from '../queryKeys'

export const useAdminUsers = defineQuery(() => {
  const { $api } = useNuxtApp()

  const { data, ...query } = useQuery({
    key: () => ADMIN_KEYS.users,
    query: () => $api('/api/admin/users'),
  })

  return {
    ...query,
    users: data,
  }
})
