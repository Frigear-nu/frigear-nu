import { defineNuxtPlugin } from '#imports'
import { useAuthApiOf } from '../utils/api'
import { createAuthClientAccess } from '../utils/access'

export type { AuthApi } from '../utils/api'
export type { AuthClientAccess } from '../utils/access'

// `$api` (see `createAuthApi`) and `$authAccess` (the issuer's `/api/auth/me/access`, see `createAuthClientAccess`).
export default defineNuxtPlugin({
  name: 'auth-client:api',
  setup(nuxtApp) {
    return { provide: { api: useAuthApiOf(nuxtApp), authAccess: createAuthClientAccess(nuxtApp) } }
  },
})
