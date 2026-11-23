import { createTeamLinks } from '../../utils/links'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the teams pages (the admin list, optionally filtered by owner, and a team's page). Always use
 * these instead of building the path by hand: they keep the locale prefix and follow `teams.settings.pages`.
 */
export function useTeamLinks() {
  const { localize } = useLocaleLink()
  return createTeamLinks(useRuntimeConfig().public.teams?.pages, localize)
}
