type I18nLike = {
  locale?: { value?: string }
  locales?: { value?: (string | { code: string })[] }
  defaultLocale?: string
  fallbackLocale?: unknown
}

const i18n = () => (useNuxtApp() as { $i18n?: I18nLike }).$i18n

/** Locale of the visitor: `@nuxtjs/i18n`'s when installed, otherwise `en`. */
export function useTranslatedLocale() {
  const nuxtApp = i18n()
  return computed(() => nuxtApp?.locale?.value ?? 'en')
}

/** Locales content can be translated into: the configured `@nuxtjs/i18n` ones when installed, otherwise just `en`. */
export function useTranslatedLocales() {
  const nuxtApp = i18n()
  return computed(() => {
    const codes = (nuxtApp?.locales?.value ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
    return codes.length ? codes : ['en']
  })
}

/** The site's default locale, used when a text has no translation for the current one. */
export function useTranslatedFallbackLocale() {
  const nuxtApp = i18n()
  return computed(() => nuxtApp?.defaultLocale ?? 'en')
}

/** Optional-i18n translator for this package's own messages (`translated.*`), falling back to the English default. */
export function useUiT(namespace: string) {
  const nuxtApp = useNuxtApp().$i18n as { t: (key: string, params?: Record<string, string | number>) => string, te?: (key: string) => boolean } | undefined
  return (key: string, fallback: string, params: Record<string, string | number> = {}): string => {
    const path = `${namespace}.${key}`
    if (nuxtApp?.te?.(path)) return nuxtApp.t(path, params)
    return Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), fallback)
  }
}
