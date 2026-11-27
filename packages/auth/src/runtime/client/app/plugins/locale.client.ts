import { defineNuxtPlugin, useUserSession, watch } from '#imports'
import { APPLIED_LOCALE_KEY, localeToApply } from '../utils/locale'

type I18n = {
  locale: { value: string }
  locales: { value: Array<string | { code: string }> }
  setLocale: (locale: string) => Promise<void>
}

// Client mode's counterpart of the server mode's `frigear-locale`: shows the app in the language the user saved at the
// issuer (the `locale` claim, or userinfo with `client.userinfo`). Applied once per sign-in and saved language, so a
// switch made in the app afterwards stays, and a language saved on the profile page is applied when the session picks
// it up. The marker lives in `localStorage`: an app restart keeps the sign-in and so the choice. Only registered with
// `@nuxtjs/i18n` (`dependsOn` its plugin); it switches after mount, when the router can navigate.
export default defineNuxtPlugin({
  name: 'auth-client:locale',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as I18n | undefined
    if (!i18n) return
    const { session } = useUserSession()

    nuxtApp.hook('app:mounted', () => {
      watch(() => [session.value?.id, (session.value?.user as { locale?: unknown } | undefined)?.locale] as const, ([id, saved]) => {
        const codes = i18n.locales.value.map(locale => typeof locale === 'string' ? locale : locale.code)
        let applied: string | null = null
        try {
          applied = localStorage.getItem(APPLIED_LOCALE_KEY)
        }
        catch {
          // storage unavailable: apply on this load
        }
        const next = localeToApply(id, saved, codes, applied)
        if (!next) return
        try {
          localStorage.setItem(APPLIED_LOCALE_KEY, next.marker)
        }
        catch {
          // storage unavailable: applied on this load only
        }
        if (i18n.locale.value !== next.locale) void i18n.setLocale(next.locale)
      }, { immediate: true })
    })
  },
})
