import { createOperationLinks } from '../../utils/links'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the operation pages (the public page, the admin list and the admin operation page). Always use
 * these instead of building the path by hand: they keep the locale prefix and follow `operations.settings.pages`.
 */
export function useOperationLinks() {
  const { localize } = useLocaleLink()
  return createOperationLinks(useRuntimeConfig().public.operations?.pages, localize)
}
