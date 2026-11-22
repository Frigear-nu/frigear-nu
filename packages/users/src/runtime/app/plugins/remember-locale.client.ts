import { usersApi } from '../../utils/api'
import { $fetch, defineNuxtPlugin, useUserSession, watch } from '#imports'

// Fills an empty `users.locale` with the app's language: once the user is signed in, and again after a language switch
// while it is still empty. It never replaces a language the user has (`ifUnset`, checked on the server too), so the
// profile page is where it changes. Without i18n there is no language to save.
export default defineNuxtPlugin((nuxtApp) => {
  const i18n = nuxtApp.$i18n as { locale: { value: string } } | undefined
  if (!i18n) return
  const { loggedIn, user, fetch: refreshSession } = useUserSession()
  // One attempt per user and language per page load, so a failing request is not retried in a loop.
  const tried = new Set<string>()

  watch([loggedIn, () => (user.value as { id?: unknown, locale?: unknown } | null), () => i18n.locale.value], async ([signedIn, current, locale]) => {
    if (!signedIn || !current || current.locale || !locale) return
    const key = `${String(current.id)}:${locale}`
    if (tried.has(key)) return
    tried.add(key)
    try {
      await $fetch(usersApi.me.locale, { method: 'PUT', body: { locale, ifUnset: true } })
      await refreshSession()
    }
    catch {
      // Not a language the server accepts, or the request failed: the user can still choose one on the profile page.
    }
  }, { immediate: true })
})
