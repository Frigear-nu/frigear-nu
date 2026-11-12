import { useAuthorization } from '../composables/useAuthorization'
import { defineNuxtPlugin, useUserSession, watch } from '#imports'

// Loads `access` (`GET /api/auth/me/access`) during SSR, so the first render and the page middleware agree, and fetches
// it again whenever the signed-in user changes (sign-in, sign-out, switching accounts).
export default defineNuxtPlugin({
  name: 'authorization:access',
  async setup() {
    const authorization = useAuthorization()
    const session = useUserSession()
    if (import.meta.server) {
      await authorization.ensure()
      return
    }
    watch(() => session.user.value?.id ?? null, (id, previous) => {
      if (id !== previous) void authorization.refresh()
    })
  },
})
