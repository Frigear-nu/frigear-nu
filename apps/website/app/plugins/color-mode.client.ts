// Keeps the color mode chosen with the header `UColorModeButton` in sync with the signed-in user, so the
// preference follows them across devices and is forwarded to the apps they sign in to (the `color_mode`
// claim, see `server/plugins/oauth-claims.ts`).
const MODES = ['light', 'dark', 'system']

export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  const { user, loggedIn, fetch: refreshSession } = useUserSession()

  const stored = () => (user.value as { colorMode?: string | null } | null)?.colorMode ?? null

  async function persist(mode: string) {
    if (!loggedIn.value || mode === stored() || !MODES.includes(mode)) return
    try {
      await $fetch('/api/account/color-mode', { method: 'POST', body: { colorMode: mode } })
      await refreshSession()
    } catch {
      // The local preference still applies; it is saved on the next change.
    }
  }

  // A stored preference wins over the one in this browser. Without one, the browser's choice is saved so
  // apps get a value from the first sign-in.
  watch(() => [loggedIn.value, stored()] as const, ([isLoggedIn, saved]) => {
    if (!isLoggedIn) return
    if (saved && saved !== colorMode.preference) colorMode.preference = saved
    else if (!saved) persist(colorMode.preference)
  }, { immediate: true })

  watch(() => colorMode.preference, mode => persist(mode))
})
