import type { ConsentCategory, ConsentMessages, Localized } from '../../../types'
import { localize } from '../../utils/consent'

// English fallbacks, used when `@nuxtjs/i18n` isn't installed or a key is missing. The translated
// strings live in `runtime/i18n/lang/*.json` (namespace `cookieConsent`) and can be overridden by
// the host app's own locale files.
const EN: ConsentMessages = {
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
}

const EN_CATEGORIES: Record<string, { label: string, description: string }> = {
  necessary: { label: 'Necessary', description: 'Required for the site to work, such as keeping you signed in. Cannot be disabled.' },
  analytics: { label: 'Analytics', description: 'Helps us understand how the site is used so we can improve it.' },
  marketing: { label: 'Marketing', description: 'Used for social media integrations and relevant content.' },
}

export function useConsentT() {
  const tm = useModuleT('cookieConsent')
  const nuxtApp = useNuxtApp()

  const { policyLabel, policyUrl } = useRuntimeConfig().public.cookieConsent ?? {}

  const locale = computed(() => (nuxtApp.$i18n as { locale?: { value?: string } } | undefined)?.locale?.value ?? 'en')

  /** Explicit option text (string or `{ da, en }` map) wins; otherwise `cookieConsent.categories.<key>.<field>`. */
  function categoryText(category: ConsentCategory, field: 'label' | 'description'): string {
    const explicit: Localized | undefined = category[field]
    if (explicit) return localize(explicit, locale.value)
    return tm(`categories.${category.key}.${field}`, EN_CATEGORIES[category.key]?.[field] ?? (field === 'label' ? category.key : ''))
  }

  return {
    locale,
    /** The policy link target for the current locale, if `policyUrl` is set. */
    policyUrl: computed(() => localize(policyUrl, locale.value) || undefined),
    /** The `policyLabel` option wins over the translated `policy` text. */
    t: (key: keyof ConsentMessages) => (key === 'policy' && policyLabel ? localize(policyLabel, locale.value) : tm(key, EN[key])),
    label: (category: ConsentCategory) => categoryText(category, 'label'),
    description: (category: ConsentCategory) => categoryText(category, 'description'),
    localize: (value: Localized | undefined, fallback = '') => localize(value, locale.value, fallback),
  }
}
