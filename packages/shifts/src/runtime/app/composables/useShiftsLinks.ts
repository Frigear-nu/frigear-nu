import { createShiftsLinks } from '../../utils/links'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the shifts pages (my shifts, one shift, swaps, the check-in scanner). They keep the locale prefix
 * and follow `shifts.settings.pages`.
 */
export function useShiftsLinks() {
  const { localize } = useLocaleLink()
  return createShiftsLinks(useRuntimeConfig().public.shifts?.pages, localize)
}
