import { configured as storeConfigured } from '#auth/user-store'

// nuxt-auth-utils' `GET /api/_auth/session` answers the cookie's snapshot. Answer the user fresh from the store instead,
// or no user at all once the session was ended (the cookie is cleared too). It is what `useUserSession()` sees, so it
// has the cookie's shape (`mapUserToSession`, the session user filters applied), not the request's user.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) return
    const principal = await resolveAuthSession(event)
    if (principal) {
      const stored = storeConfigured ? await useAuthUserStore().findById(principal.user.id) : null
      session.user = stored ? mapUserToSession(stored) : principal.user
      return
    }
    for (const key of Object.keys(session)) Reflect.deleteProperty(session, key)
  })
})
