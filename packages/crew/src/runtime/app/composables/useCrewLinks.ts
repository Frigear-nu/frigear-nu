import { createCrewLinks } from '../../utils/links'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the crew pages (apply, status, invite). Always use these instead of building the path by hand:
 * they keep the locale prefix and follow `crew.settings.pages`.
 */
export function useCrewLinks() {
  const { localize } = useLocaleLink()
  return createCrewLinks(useRuntimeConfig().public.crew?.pages, localize)
}
