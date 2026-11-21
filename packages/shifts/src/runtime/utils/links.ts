/** The configured page paths (`public.shifts.pages`). */
export type ShiftsPages = { shifts?: string, shift?: string, swaps?: string, checkIn?: string, lead?: string, station?: string }

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
 * `@frigear-nu/ui`). A page that is turned off still gets a link on its default path; callers decide from `pages`.
 */
export function createShiftsLinks(pages: ShiftsPages | undefined, localize: (path: string) => string) {
  return {
    shifts: () => localize(pages?.shifts || SHIFTS_DEFAULT_PAGES.shifts),
    shift: (assignmentId: string) => localize((pages?.shift || SHIFTS_DEFAULT_PAGES.shift).replace(':assignmentId', encodeURIComponent(assignmentId))),
    swaps: () => localize(pages?.swaps || SHIFTS_DEFAULT_PAGES.swaps),
    checkIn: (teamId: string) => localize((pages?.checkIn || SHIFTS_DEFAULT_PAGES.checkIn).replace(':teamId', encodeURIComponent(teamId))),
    lead: (teamId: string) => localize((pages?.lead || SHIFTS_DEFAULT_PAGES.lead).replace(':teamId', encodeURIComponent(teamId))),
    station: (stationId: string) => localize((pages?.station || SHIFTS_DEFAULT_PAGES.station).replace(':stationId', encodeURIComponent(stationId))),
  }
}
