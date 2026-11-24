import { userLocaleOfferKey, userLocaleToOffer } from '../../utils/locale'
import { defineNuxtPlugin, useModuleT, useToast, useUserSession, watch } from '#imports'

type I18n = {
  locale: { value: string }
  locales: { value: Array<string | { code: string, name?: string }> }
  setLocale: (locale: string) => Promise<void>
}

// When a signed-in user's saved language (`users.locale`) is not the one the page is shown in (they came from another
// site in another language, or switched here), a toast offers to switch to it. Dismissing or switching is remembered for
// the browser session (`sessionStorage`), so the offer is made once. The check waits for the language to settle, so a
// switch already under way (a login applying its language) does not trigger it. Only with `@nuxtjs/i18n` (`dependsOn`
// its plugin, as in `remember-locale.client`) and `@nuxt/ui`.
export default defineNuxtPlugin({
  name: 'users:offer-locale',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as I18n | undefined
    if (!i18n) return

    nuxtApp.hook('app:mounted', () => {
      const { loggedIn, user } = useUserSession()
      const toast = useToast()
      const t = useModuleT('users')
      // Offers made on this page load, also when storage is unavailable.
      const offered = new Set<string>()
      const answered = (key: string) => {
        try {
          return sessionStorage.getItem(key) === '1'
        }
        catch {
          return false
        }
      }
      const remember = (key: string) => {
        try {
          sessionStorage.setItem(key, '1')
        }
        catch {
          // storage unavailable: not offered again on this page load only
        }
      }

      const offer = () => {
        const current = user.value as { id?: unknown, locale?: unknown } | null
        if (!loggedIn.value || !current) return
        const locales = i18n.locales.value.map(locale => typeof locale === 'string' ? { code: locale } : locale)
        const locale = userLocaleToOffer(current.locale, i18n.locale.value, locales.map(item => item.code))
        if (!locale) return
        const key = userLocaleOfferKey(current.id, locale)
        if (offered.has(key) || answered(key)) return
        offered.add(key)
        const language = locales.find(item => item.code === locale)?.name ?? locale
        toast.add({
          'id': 'users:offer-locale',
          'title': t('offerLocale.title', 'Your language is {language}', { language }),
          'description': t('offerLocale.description', 'Your account is set to {language}. Show this site in it?', { language }),
          'icon': 'i-lucide-languages',
          'actions': [{
            label: t('offerLocale.switch', 'Switch to {language}', { language }),
            color: 'primary',
            variant: 'solid',
            onClick: () => {
              remember(key)
              void i18n.setLocale(locale)
            },
          }],
          // Closed by hand or timed out: not offered again this session.
          'onUpdate:open': (open: boolean) => {
            if (!open) remember(key)
          },
        })
      }

      let timer: ReturnType<typeof setTimeout> | undefined
      watch([loggedIn, () => (user.value as { locale?: unknown } | null)?.locale, () => i18n.locale.value], () => {
        clearTimeout(timer)
        timer = setTimeout(offer, 1000)
      }, { immediate: true })
    })
  },
})
