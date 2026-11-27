import { defineNuxtPlugin, useUserSession, watch } from '#imports'
import { localeToApply } from '../utils/locale'

type I18n = {
  locale: { value: string }
  locales: { value: Array<string | { code: string }> }
  setLocale: (locale: string) => Promise<void>
}

// Client mode shows the app in the language saved on the user's account at the issuer (the `locale` claim, or userinfo
// with `client.userinfo`): at every start and sign-in, and when the saved language changes (the profile page). Only
// registered with `@nuxtjs/i18n` (`dependsOn` its plugin); it switches after mount, when the router can navigate (a
// prefix strategy moves the URL). An app should use `strategy: 'no_prefix'`: with a prefix, every link to an unprefixed
// path (tabs, redirects) goes back to the default locale.
export default defineNuxtPlugin({
  name: 'auth-client:locale',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as I18n | undefined
    if (!i18n) return
    const { session } = useUserSession()

    nuxtApp.hook('app:mounted', () => {
      watch(() => [session.value?.id, (session.value?.user as { locale?: unknown } | undefined)?.locale] as const, ([id, saved]) => {
        if (!id) return
        const codes = i18n.locales.value.map(locale => typeof locale === 'string' ? locale : locale.code)
        const locale = localeToApply(saved, i18n.locale.value, codes)
        if (locale) void i18n.setLocale(locale)
      }, { immediate: true })
    })
  },
})
