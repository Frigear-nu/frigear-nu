import { usersApi } from '../../utils/api'
import { $fetch, defineNuxtPlugin, useUserSession, watch } from '#imports'

// Fills an empty `users.locale` with the app's language: once the user is signed in, and again after a language switch
// while it is still empty. It never replaces a language the user has (`ifUnset`, checked on the server too), so the
// profile page is where it changes. Without i18n there is no language to save.
// `@nuxtjs/i18n` provides `$i18n` in its own plugin, which would run after this one without `dependsOn`: the plugins of
// a module installed after i18n (every host installs it first) are put in front of i18n's.
export default defineNuxtPlugin({
  name: 'users:remember-locale',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
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
  },
})
