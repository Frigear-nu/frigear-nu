import { defineNuxtPlugin, useUserSession, watch } from '#imports'

// Applies the `color_mode` claim of frigear.nu once per login, so the same mode is used here. Later changes made on
// this site are left alone (the marker holds the login the mode was applied for).
export default defineNuxtPlugin((nuxtApp) => {
  const colorMode = nuxtApp.$colorMode as { preference: string } | undefined
  const { session } = useUserSession()
  if (!colorMode) return

  watch(() => session.value?.frigear as { colorMode?: string, loggedInAt?: number } | undefined, (frigear) => {
    if (!frigear?.colorMode || !frigear.loggedInAt) return
    try {
      if (sessionStorage.getItem('frigear:color-mode') === String(frigear.loggedInAt)) return
      sessionStorage.setItem('frigear:color-mode', String(frigear.loggedInAt))
    }
    catch {
      // storage unavailable: apply on this load only
    }
    colorMode.preference = frigear.colorMode
  }, { immediate: true })
})
