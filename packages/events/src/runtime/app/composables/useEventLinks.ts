import { createEventLinks } from '../../utils/links'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the event pages (`/events`, `/events/:slug`, `/account/tickets`, the admin list and event
 * page). Always use these instead of building the path by hand: they keep the locale prefix (`/en/events` stays under
 * `/en`) and follow `events.settings.pages`.
 */
export function useEventLinks() {
  const { localize } = useLocaleLink()
  return createEventLinks(useRuntimeConfig().public.events?.pages, localize)
}
