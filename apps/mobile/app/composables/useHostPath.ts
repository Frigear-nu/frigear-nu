/**
 * A path of a website page in the app's language: the website uses the same locales (`prefix_except_default`), so
 * `/events/x` becomes `/en/events/x` in English. For pages the app does not have, so `localePath` cannot build them.
 */
export function useHostPath() {
  const { locale, defaultLocale } = useI18n()
  return (path: string): string => (locale.value === defaultLocale ? path : `/${locale.value}${path === '/' ? '' : path}`)
}
