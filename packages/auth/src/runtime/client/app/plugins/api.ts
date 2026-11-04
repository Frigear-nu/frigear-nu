import { defineNuxtPlugin } from '#imports'
import { useAuthApiOf } from '../utils/api'

export type { AuthApi } from '../utils/api'

// `$api` (see `createAuthApi`).
export default defineNuxtPlugin({
  name: 'auth-client:api',
  setup(nuxtApp) {
    return { provide: { api: useAuthApiOf(nuxtApp) } }
  },
})
