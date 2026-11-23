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

/** How long an invite link lasts when staff set no expiry: 30 days. */
export const CREW_INVITE_DEFAULT_DAYS = 30
