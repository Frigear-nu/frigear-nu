import { isExternalPath, stripLocale } from '../utils/locale'

type LocaleAwareApp = {
  $i18n?: { locales?: { value?: (string | { code: string })[] } }
  $localePath?: (path: string) => string
}

/**
 * Locale-aware paths that work with and without `@nuxtjs/i18n`: `localize` adds the active locale's prefix
 * (identity without i18n), `strip` removes one, `isActive` compares a target with the current route regardless of
 * prefixes (`exact` for targets like a dashboard at an area's base path). Named so it does not clash with i18n's
 * own `useLocalePath`.
 */
export function useLocaleLink() {
  const nuxtApp = useNuxtApp() as unknown as LocaleAwareApp
  const route = useRoute()

  const codes = () => (nuxtApp.$i18n?.locales?.value ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)

  const strip = (path: string): string => stripLocale(path, codes())

  const localize = (path: string): string => {
    if (!nuxtApp.$localePath || !path.startsWith('/') || isExternalPath(path)) return path
    return nuxtApp.$localePath(strip(path)) || path
  }

  const isActive = (to: string | undefined, options: { exact?: boolean } = {}): boolean => {
    if (!to || isExternalPath(to)) return false
    const target = strip(to)
    const current = strip(route.path)
    if (options.exact || target === '/') return current === target
    return current === target || current.startsWith(`${target}/`)
  }

  return { localize, strip, isActive }
}
