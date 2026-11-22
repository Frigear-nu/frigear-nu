/** The configured page paths (`public.crew.pages`): `apply` with an `:operationSlug` param, `invite` with a `:token` param. */
export type CrewPages = { apply?: string, status?: string, invite?: string }

/** The default page paths, as `pages.apply`, `pages.status` and `pages.invite` resolve `true`. */
export const CREW_DEFAULT_PAGES = {
  home: '/crew',
  apply: '/crew/apply/:operationSlug',
  status: '/crew/status',
  invite: '/crew/invite/:token',
} as const

/**
 * Builds every link to a crew page. All of them go through `localize` (the active locale's prefix, see `useLocaleLink`
 * of `@frigear-nu/ui`). A page that is turned off still gets a link on its default path, so a caller decides whether
 * to show it from `pages`.
 */
export function createCrewLinks(pages: CrewPages | undefined, localize: (path: string) => string) {
  return {
    apply: (operationSlug: string) => localize((pages?.apply || CREW_DEFAULT_PAGES.apply).replace(':operationSlug', encodeURIComponent(operationSlug))),
    status: () => localize(pages?.status || CREW_DEFAULT_PAGES.status),
    invite: (token: string) => localize((pages?.invite || CREW_DEFAULT_PAGES.invite).replace(':token', encodeURIComponent(token))),
  }
}

/** How the site's locales appear in paths: what `@nuxtjs/i18n` was configured with, as the module records it. */
export type CrewI18n = { strategy: string, defaultLocale: string | null, locales: string[] }

/**
 * `path` with the prefix of `locale` when the site uses prefixed routes (`prefix`, `prefix_and_default`, and
 * `prefix_except_default` for a locale other than the default). Links that leave the app (status emails, pushes) cannot
 * ask `useLocaleLink`, so they use this. An unknown locale (`da-DK` is matched as `da`), or no i18n, leaves the path.
 */
export function localizeCrewPath(path: string, locale: string | undefined | null, i18n: CrewI18n | null | undefined): string {
  if (!locale || !i18n || i18n.strategy === 'no_prefix') return path
  const code = i18n.locales.includes(locale) ? locale : i18n.locales.find(item => item === locale.split(/[-_]/)[0])
  if (!code) return path
  if (i18n.strategy === 'prefix_except_default' && code === i18n.defaultLocale) return path
  return `/${code}${path}`
}

/** How long an invite link lasts when staff set no expiry: 30 days. */
export const CREW_INVITE_DEFAULT_DAYS = 30
