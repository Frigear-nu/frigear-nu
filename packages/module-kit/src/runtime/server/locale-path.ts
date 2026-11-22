/**
 * How a site's locales appear in its paths: what `@nuxtjs/i18n` was configured with (`strategy`, `defaultLocale` and
 * the locale codes), as a module records it in its runtime config for server code.
 */
export type LocaleRouting = { strategy: string, defaultLocale: string | null, locales: string[] }

/**
 * `path` with the prefix of `locale` when the site uses prefixed routes (`prefix`, `prefix_and_default`, and
 * `prefix_except_default` for a locale other than the default). For links that leave the app (emails, pushes), which
 * cannot ask `useLocaleLink`. A regional code matches its language (`da-DK`, `en_GB`); an unknown locale, no locale or
 * no i18n leaves the path as it is.
 *
 *     `${origin}${localizePath('/crew/status', user.locale, config.i18n)}`
 */
export function localizePath(path: string, locale: string | null | undefined, i18n: LocaleRouting | null | undefined): string {
  if (!locale || !i18n || i18n.strategy === 'no_prefix') return path
  const code = i18n.locales.includes(locale) ? locale : i18n.locales.find(item => item === locale.split(/[-_]/)[0])
  if (!code) return path
  if (i18n.strategy === 'prefix_except_default' && code === i18n.defaultLocale) return path
  return `/${code}${path}`
}
