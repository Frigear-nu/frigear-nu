import type { TeamLadder } from '../../types'

/** Role keys and team kinds: lower case letters, digits, `-` and `_`, starting with a letter or digit. */
export const TEAM_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/** The kind of the one ladder the module ships, and of a new team unless the app picks another. */
export const DEFAULT_TEAM_KIND = 'default'

/**
 * The ladder the module ships: one generic `default` kind, `member` then `lead`, led from `lead`. An app adds its own
 * kinds and ladders with the module option `ladders`.
 */
export const DEFAULT_TEAM_LADDERS: Readonly<Record<string, TeamLadder>> = Object.freeze({
  [DEFAULT_TEAM_KIND]: {
    roles: [
      { key: 'member', label: { en: 'Member', da: 'Medlem' } },
      { key: 'lead', label: { en: 'Lead', da: 'Leder' } },
    ],
    leadFrom: 'lead',
  },
})

/** The ordered role keys of a ladder, lowest first. */
export function ladderKeys(ladder: TeamLadder | undefined): string[] {
  return ladder?.roles.map(role => role.key) ?? []
}

/** The position of `role` on the ladder (0 = lowest), or `-1` when it is not on it. */
export function teamRoleRank(keys: readonly string[] | undefined, role: string): number {
  return keys ? keys.indexOf(role) : -1
}

/** Whether `held` is at or above `min` on the ladder (role keys, lowest first). A role missing from it fails closed. */
export function roleAtLeast(keys: readonly string[] | undefined, held: string, min: string): boolean {
  const heldRank = teamRoleRank(keys, held)
  const minRank = teamRoleRank(keys, min)
  return heldRank >= 0 && minRank >= 0 && heldRank >= minRank
}

/** Whether `role` is at or above `leadFrom` on the ladder. `false` without a `leadFrom` or for an unknown role. */
export function isLeadRole(keys: readonly string[] | undefined, role: string, leadFrom: string | null | undefined): boolean {
  if (!leadFrom) return false
  const held = teamRoleRank(keys, role)
  const min = teamRoleRank(keys, leadFrom)
  return held >= 0 && min >= 0 && held >= min
}

/** The problems of a ladder definition (empty when it is valid): keys well formed and unique, `leadFrom` on it. */
export function teamLadderIssues(ladder: TeamLadder): string[] {
  const issues: string[] = []
  if (!ladder.roles.length) issues.push('A ladder needs at least one role.')
  const seen = new Set<string>()
  for (const role of ladder.roles) {
    if (!TEAM_KEY_PATTERN.test(role.key)) issues.push(`"${role.key}" is not a valid role key: use lower case letters, digits, - and _.`)
    if (seen.has(role.key)) issues.push(`"${role.key}" is on the ladder twice.`)
    seen.add(role.key)
  }
  if (ladder.leadFrom && !seen.has(ladder.leadFrom)) issues.push(`The lead role "${ladder.leadFrom}" is not on the ladder.`)
  return issues
}

/** The default ladders merged with the module option `ladders` (a kind in the option replaces the default one). */
export function mergeTeamLadders(option: Record<string, TeamLadder> | undefined): Record<string, TeamLadder> {
  return { ...DEFAULT_TEAM_LADDERS, ...option }
}
