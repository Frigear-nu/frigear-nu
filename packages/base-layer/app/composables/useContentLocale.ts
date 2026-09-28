// `@nuxtjs/i18n` is optional, so we avoid a hard dependency on its types and
// composables and instead duck-type the `$i18n` plugin it injects when the
// consuming app installs and configures it.
type LocaleAwareNuxtApp = ReturnType<typeof useNuxtApp> & {
  $i18n?: { locale: Ref<string>, defaultLocale: string, localeCodes?: Ref<string[]> | string[] }
}

export const useContentLocale = () => {
  const nuxtApp = useNuxtApp() as LocaleAwareNuxtApp
  const defaultLocale = computed(() => nuxtApp.$i18n?.defaultLocale)

  // `@nuxtjs/i18n` is installed unconditionally by the base layer, but apps
  // that don't configure any `locales` (see `content.config.ts` /
  // `modules/routing.ts`) still get a resolved `$i18n.locale` (e.g. from the
  // `Accept-Language` header or the system locale) even though no such
  // locale was ever configured. Treating that value as significant would
  // point content queries at a locale-suffixed collection (e.g. `pages_en_US`)
  // that doesn't exist, breaking `useCurrentPage`/`useConfig` entirely.
  // Only trust the detected locale when it's one of the app's configured
  // locale codes.
  const availableLocaleCodes = computed(() => {
    const codes = nuxtApp.$i18n?.localeCodes
    return unref(codes) ?? []
  })
  const locale = computed(() => {
    const code = nuxtApp.$i18n?.locale.value
    return code && availableLocaleCodes.value.includes(code) ? code : undefined
  })

  // `@nuxtjs/i18n` prefixes routes with the active locale (e.g. `/en/services`)
  // depending on the configured strategy, but localized content collections
  // are keyed per locale (`pages` -> `content/**`, `pages_no` -> `content/no/**`),
  // and paths within each collection are unprefixed (`/services`). Strip the
  // route's locale prefix so path-based content queries keep matching
  // regardless of the routing strategy (`prefix`, `prefix_except_default`, ...).
  const stripLocalePrefix = (path: string) => {
    const code = locale.value
    if (!code) {
      return path
    }
    const prefix = `/${code}`
    if (path === prefix) {
      return '/'
    }
    if (path.startsWith(`${prefix}/`)) {
      return path.slice(prefix.length)
    }
    return path
  }

  // The landing and catch-all pages opt out of `@nuxtjs/i18n`'s automatic
  // route localization (see `modules/routing.ts`) to avoid conflicting,
  // duplicate routes per locale. That means `@nuxtjs/i18n` composables like
  // `switchLocalePath` can't resolve them either, so build the localized
  // path for an arbitrary route ourselves instead.
  const localizePath = (path: string, targetLocale: string) => {
    const unprefixed = stripLocalePrefix(path)
    if (targetLocale === defaultLocale.value) {
      return unprefixed
    }
    return unprefixed === '/' ? `/${targetLocale}` : `/${targetLocale}${unprefixed}`
  }

  return {
    locale,
    defaultLocale,
    stripLocalePrefix,
    localizePath,
  }
}
