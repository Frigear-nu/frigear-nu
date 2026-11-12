import { useAuthorization } from '../composables/useAuthorization'
import { defineNuxtPlugin, useRuntimeConfig, useUserSession, watch } from '#imports'

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
    // Client mode: the tokens only exist in the browser, and Auth restored the session before this plugin ran, so the
    // server's (signed-out) answer is replaced here. Without SSR this starts the first load the middleware then awaits.
    if (useRuntimeConfig().public.authorization?.client && session.loggedIn.value) void authorization.refresh()
    watch(() => session.user.value?.id ?? null, (id, previous) => {
      if (id !== previous) void authorization.refresh()
    })
  },
})
