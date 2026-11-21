/** The configured page paths (`public.teams.pages`), the team page with an `:id` param. */
export type TeamPages = { admin?: string, adminTeam?: string }

/**
 * Builds every link to a teams page. All of them go through `localize` (the active locale's prefix, see `useLocaleLink`
 * of `@frigear-nu/ui`). `query` is appended to the list link (an owner filter).
 */
export function createTeamLinks(pages: TeamPages | undefined, localize: (path: string) => string) {
  return {
    admin: (query?: Record<string, string>) => {
      const path = localize(pages?.admin || '/admin/teams')
      const search = query ? new URLSearchParams(query).toString() : ''
      return search ? `${path}?${search}` : path
    },
    adminTeam: (id: string) => localize((pages?.adminTeam || '/admin/teams/:id').replace(':id', encodeURIComponent(id))),
  }
}
