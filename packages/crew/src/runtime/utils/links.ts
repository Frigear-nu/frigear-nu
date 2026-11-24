/**
 * The configured page paths (`public.crew.pages`): `apply` with an `:operationSlug` param, `invite` with a `:token`
 * param. `home` is the crew home, whose tabs (`crew.dashboard`) stand in for a page that is not there.
 */
export type CrewPages = { home?: string, apply?: string, status?: string, invite?: string }

/**
 * The default page paths, as `true` resolves them. With the signed-in hub of `@frigear-nu/dashboard` the home page is
 * `<hub>/crew` instead (`/dashboard/crew`), and My crew is a tab of it rather than a page.
 */
export const CREW_DEFAULT_PAGES = {
  home: '/crew',
  apply: '/crew/apply/:operationSlug',
  status: '/crew/status',
  invite: '/crew/invite/:token',
} as const

/**
 * The crew home's path from its `pages.home` option: a string as is, `false` none, otherwise `<hub>/crew` below the
 * signed-in hub of `@frigear-nu/dashboard` (`hub`, when there is one) or `/crew`.
 */
export function resolveCrewHomePath(setting: string | boolean | undefined, hub: string | undefined): string | undefined {
  if (setting === false) return undefined
  if (typeof setting === 'string') return setting
  return hub ? `${hub.replace(/\/+$/, '')}/crew` : CREW_DEFAULT_PAGES.home
}

/** The tab area of the crew home page: crew adds Overview and My crew, shifts My shifts and Swaps. */
export const CREW_HOME_TABS = 'crew.dashboard'

/** The ids of crew's own tabs on the crew home page (`?tab=status`). The first tab, `overview`, is the default. */
export const CREW_HOME_TAB = { overview: 'overview', status: 'status' } as const

/** A tab of the crew home page: `<home>?tab=<id>`, or the home page itself for the default tab. */
export const crewHomeTab = (home: string, tab: string) => tab === CREW_HOME_TAB.overview ? home : `${home}?tab=${encodeURIComponent(tab)}`

/**
 * Builds every link to a crew page. All of them go through `localize` (the active locale's prefix, see `useLocaleLink`
 * of `@frigear-nu/ui`). My crew is the status page when there is one, else the My crew tab of the home page. A page that
 * is turned off still gets a link on its default path, so a caller decides whether to show it from `pages`.
 */
export function createCrewLinks(pages: CrewPages | undefined, localize: (path: string) => string) {
  return {
    home: (tab?: string) => localize(tab ? crewHomeTab(pages?.home || CREW_DEFAULT_PAGES.home, tab) : pages?.home || CREW_DEFAULT_PAGES.home),
    apply: (operationSlug: string) => localize((pages?.apply || CREW_DEFAULT_PAGES.apply).replace(':operationSlug', encodeURIComponent(operationSlug))),
    status: () => localize(crewStatusPath(pages) || CREW_DEFAULT_PAGES.status),
    invite: (token: string) => localize((pages?.invite || CREW_DEFAULT_PAGES.invite).replace(':token', encodeURIComponent(token))),
  }
}

/** Where a person sees their crew status: the status page, else the My crew tab of the home page (`undefined`: neither). */
export function crewStatusPath(pages: CrewPages | undefined): string | undefined {
  if (pages?.status) return pages.status
  return pages?.home ? crewHomeTab(pages.home, CREW_HOME_TAB.status) : undefined
}

/** How long an invite link lasts when staff set no expiry: 30 days. */
export const CREW_INVITE_DEFAULT_DAYS = 30
