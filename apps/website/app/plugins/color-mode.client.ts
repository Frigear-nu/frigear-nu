// Keeps the color mode chosen with the header `UColorModeButton` in sync with the signed-in user's `colorMode`
// preference (see `shared/preferences.ts`), so it follows them across devices and is forwarded to the apps they
// sign in to as the `color_mode` claim.
export default defineNuxtPlugin(() => {
  const colorMode = useColorMode()
  const { loggedIn } = useUserSession()
  const { preferences, set } = useUserPreferences()

  async function persist(mode: string) {
    if (!loggedIn.value || mode === preferences.value.colorMode) return
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system') return
    try {
      await set('colorMode', mode)
    } catch {
      // The local preference still applies; it is saved on the next change.
    }
  }

  // A stored preference wins over the one in this browser. Without one, the browser's choice is saved so
  // apps get a value from the first sign-in.
  watch(() => [loggedIn.value, preferences.value.colorMode] as const, ([isLoggedIn, saved]) => {
    if (!isLoggedIn) return
    if (saved && saved !== colorMode.preference) colorMode.preference = saved
    else if (!saved) persist(colorMode.preference)
  }, { immediate: true })

  watch(() => colorMode.preference, mode => persist(mode))
})
