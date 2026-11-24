import { defineNuxtPlugin, useUserSession, watch } from '#imports'

// Applies the `locale` claim of frigear.nu (one of this app's i18n locales) once per login, so the site is shown in the
// language the user saved there. `setLocale` moves the URL prefix and cookie along. Later switches made on this site are
// left alone (the marker holds the login the language was applied for). Only registered with `@nuxtjs/i18n`, whose
// plugin provides `$i18n` (`dependsOn`); it switches after mount, when the router can navigate.
export default defineNuxtPlugin({
  name: 'auth:frigear-locale',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as { locale: { value: string }, setLocale: (locale: string) => Promise<void> } | undefined
    if (!i18n) return
    const { session } = useUserSession()

    nuxtApp.hook('app:mounted', () => {
      watch(() => session.value?.frigear as { locale?: string, loggedInAt?: number } | undefined, (frigear) => {
        if (!frigear?.locale || !frigear.loggedInAt) return
        try {
          if (sessionStorage.getItem('frigear:locale') === String(frigear.loggedInAt)) return
          sessionStorage.setItem('frigear:locale', String(frigear.loggedInAt))
        }
        catch {
          // storage unavailable: apply on this load only
        }
        if (i18n.locale.value !== frigear.locale) void i18n.setLocale(frigear.locale)
      }, { immediate: true })
    })
  },
})
