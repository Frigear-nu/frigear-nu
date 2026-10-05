import { ADMIN_KEYS } from '../queryKeys'
import type { AdminCreateUserSchema, AdminUpdateUserSchema } from '#shared/schema/admin/user'

export const useAdminCreateUser = defineMutation(() => {
  const { $api } = useNuxtApp()
  const queryCache = useQueryCache()

  const { mutateAsync, ...mutation } = useMutation({
    mutation: (user: AdminCreateUserSchema) => $api('/api/admin/users', {
      method: 'post',
      body: user,
    }),
    onSuccess() {
      return queryCache.invalidateQueries({
        key: ADMIN_KEYS.users,
      })
    },
  })

  return {
    ...mutation,
    createUser: mutateAsync,
  }
})

export const useAdminUpdateUser = defineMutation(() => {
  const { $api } = useNuxtApp()
  const queryCache = useQueryCache()

  const { mutateAsync, ...mutation } = useMutation({
    mutation: ({ userId, user }: { userId: number, user: AdminUpdateUserSchema }) => $api(`/api/admin/users/${userId}`, {
      method: 'post',
      body: user,
    }),
    onSuccess() {
      return queryCache.invalidateQueries({
        key: ADMIN_KEYS.users,
      })
    },
  })

  return {
    ...mutation,
    updateUser: mutateAsync,
  }
})
