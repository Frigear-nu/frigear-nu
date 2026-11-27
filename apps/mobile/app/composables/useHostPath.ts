/**
 * A path of a website page in the app's language: the website uses the same locales with a prefix for all but Danish
 * (`prefix_except_default`, the app has none), so `/events/x` becomes `/en/events/x` in English.
 */
export function useHostPath() {
  const { locale, defaultLocale } = useI18n()
  return (path: string): string => (locale.value === defaultLocale ? path : `/${locale.value}${path === '/' ? '' : path}`)
}
