import type { ConsentMessages } from '../../../types'
import { localize } from '../../utils/consent'

const BUILT_IN: Record<string, ConsentMessages> = {
  en: {
    description: 'We use cookies to improve your experience. Choose which categories you allow.',
    accept: 'Accept all',
    reject: 'Reject all',
    preferences: 'Preferences',
    expand: 'Show cookie consent',
    manage: 'Manage cookies',
    save: 'Save choices',
    preferencesTitle: 'Cookie preferences',
    preferencesDescription: 'Choose which cookies you allow. You can change this at any time.',
    required: 'Always on',
    policy: 'Read more',
    cookies: 'Cookies',
  },
  da: {
    description: 'Vi bruger cookies for at forbedre din oplevelse. Vælg hvilke kategorier du tillader.',
    accept: 'Acceptér alle',
    reject: 'Afvis alle',
    preferences: 'Indstillinger',
    expand: 'Vis cookie-samtykke',
    manage: 'Administrér cookies',
    save: 'Gem valg',
    preferencesTitle: 'Cookie-indstillinger',
    preferencesDescription: 'Vælg hvilke cookies du tillader. Du kan til enhver tid ændre det.',
    required: 'Altid aktiv',
    policy: 'Læs mere',
    cookies: 'Cookies',
  },
}

/** Locale from `@nuxtjs/i18n` when installed (same approach as `@frigear-nu/events`), else `en`. */
export function useConsentT() {
  const nuxtApp = useNuxtApp()
  const config = useRuntimeConfig().public.cookieConsent!

  const locale = computed(() => (nuxtApp.$i18n as { locale?: { value?: string } } | undefined)?.locale?.value ?? 'en')
  const messages = computed(() => {
    const base = locale.value.split('-')[0]!
    return { ...BUILT_IN.en!, ...BUILT_IN[base], ...config.messages[base], ...config.messages[locale.value] } as ConsentMessages
  })

  return {
    locale,
    t: (key: keyof ConsentMessages) => messages.value[key],
    localize: (value: Parameters<typeof localize>[0], fallback = '') => localize(value, locale.value, fallback),
  }
}
