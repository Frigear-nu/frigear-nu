/**
 * How a site's locales appear in its paths: what `@nuxtjs/i18n` was configured with (`strategy`, `defaultLocale` and
 * the locale codes), as a module records it in its runtime config for server code.
 */
export type LocaleRouting = {
  strategy: string
  defaultLocale: string | null
  locales: string[]
  /** The cookie i18n keeps the chosen locale in (`detectBrowserLanguage.cookieKey`); `null` or absent when it keeps none. */
  cookie?: string | null
}

/**
 * The site's code for a language tag: one of `locales` matched without regard to case, else the one of its language
 * (`en-GB`, `en_GB` → `en`). `null` for no tag or one the site does not have.
 */
export function matchLocale(tag: string | null | undefined, locales: readonly string[]): string | null {
  const value = typeof tag === 'string' ? tag.trim().toLowerCase() : ''
  if (!value) return null
  const language = value.split(/[-_]/)[0]
  return locales.find(code => code.toLowerCase() === value)
    ?? locales.find(code => code.toLowerCase() === language)
    ?? null
}

/**
 * The first language of a preference list the site has (`matchLocale`): a space-separated list such as OIDC's
 * `ui_locales` (`"en-GB da"`), or an array. `null` when none of them is known.
 */
export function pickLocale(preferred: string | readonly string[] | null | undefined, locales: readonly string[]): string | null {
  const tags = typeof preferred === 'string' ? preferred.split(/\s+/) : preferred ?? []
  for (const tag of tags) {
    const code = matchLocale(tag, locales)
    if (code) return code
  }
  return null
}

/**
 * The locale a site path is shown in: its locale prefix, else the default locale when unprefixed paths are in it
 * (`prefix_except_default`, `prefix_and_default`). `null` without i18n, under `no_prefix` (the locale is not in the
 * path) and for an unprefixed path under `prefix`.
 */
export function localeOfPath(path: string, i18n: LocaleRouting | null | undefined): string | null {
  if (!i18n || i18n.strategy === 'no_prefix' || !path.startsWith('/')) return null
  const first = (path.split(/[?#]/)[0] ?? '').split('/')[1] ?? ''
  const prefixed = i18n.locales.find(code => code === first)
  if (prefixed) return prefixed
  return i18n.strategy === 'prefix_except_default' || i18n.strategy === 'prefix_and_default' ? i18n.defaultLocale : null
}

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
