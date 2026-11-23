/**
 * The configured page paths (`public.shifts.pages`). `home` is the crew home of `@frigear-nu/crew`, whose My shifts and
 * Swaps tabs (`crew.dashboard`) stand in for the `shifts` and `swaps` pages when they are not there.
 */
export type ShiftsPages = { shifts?: string, shift?: string, swaps?: string, checkIn?: string, lead?: string, station?: string, home?: string }

/** The ids of shifts' tabs on the crew home page (`crew.dashboard`): `?tab=shifts`, `?tab=swaps`. */
export const SHIFTS_HOME_TAB = { shifts: 'shifts', swaps: 'swaps' } as const

/** My shifts: the page when there is one, else the My shifts tab of the crew home (`undefined`: neither). */
export const shiftsMinePath = (pages: ShiftsPages | undefined) => pages?.shifts || (pages?.home ? `${pages.home}?tab=${SHIFTS_HOME_TAB.shifts}` : undefined)

/** The swaps: the page when there is one, else the Swaps tab of the crew home (`undefined`: neither). */
export const shiftsSwapsPath = (pages: ShiftsPages | undefined) => pages?.swaps || (pages?.home ? `${pages.home}?tab=${SHIFTS_HOME_TAB.swaps}` : undefined)

/** The default page paths, as `true` resolves them. */
export const SHIFTS_DEFAULT_PAGES = {
  shifts: '/shifts',
  shift: '/shifts/:assignmentId',
  swaps: '/shifts/swaps',
  checkIn: '/shifts/check-in/:teamId',
  lead: '/shifts/lead/:teamId',
  station: '/shifts/station/:stationId',
} as const

/**
 * Builds every link to a shifts page through `localize` (the active locale's prefix, see `useLocaleLink` of
 * `@frigear-nu/ui`). My shifts and the swaps link to their tab of the crew home when they have no page. A page that is
 * turned off still gets a link on its default path; callers decide from `pages`.
 */
export function createShiftsLinks(pages: ShiftsPages | undefined, localize: (path: string) => string) {
  return {
    shifts: () => localize(shiftsMinePath(pages) || SHIFTS_DEFAULT_PAGES.shifts),
    shift: (assignmentId: string) => localize((pages?.shift || SHIFTS_DEFAULT_PAGES.shift).replace(':assignmentId', encodeURIComponent(assignmentId))),
    swaps: () => localize(shiftsSwapsPath(pages) || SHIFTS_DEFAULT_PAGES.swaps),
    checkIn: (teamId: string) => localize((pages?.checkIn || SHIFTS_DEFAULT_PAGES.checkIn).replace(':teamId', encodeURIComponent(teamId))),
    lead: (teamId: string) => localize((pages?.lead || SHIFTS_DEFAULT_PAGES.lead).replace(':teamId', encodeURIComponent(teamId))),
    station: (stationId: string) => localize((pages?.station || SHIFTS_DEFAULT_PAGES.station).replace(':stationId', encodeURIComponent(stationId))),
  }
}
