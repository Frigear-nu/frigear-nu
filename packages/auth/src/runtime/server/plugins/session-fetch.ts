// nuxt-auth-utils' `GET /api/_auth/session` answers the cookie's snapshot. Answer the user as `getAuth` sees them
// instead: fresh from the store, or no user at all once the session was ended (the cookie is cleared too).
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) return
    const principal = await resolveAuthSession(event)
    if (principal) {
      session.user = principal.user
      return
    }
    for (const key of Object.keys(session)) Reflect.deleteProperty(session, key)
  })
})
