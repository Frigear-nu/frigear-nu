import type { TeamOwner, TeamRoleGrant, TeamRoleMappingDto, TeamRoleMatch, TeamsMappedGrant, TeamsResolverTeam } from '../../types'
import { teamRoleRank } from './ladders'

// The pure part of role resolution: which rules apply to which team, which mapped grant wins, and how explicit and
// mapped grants merge. The server utils (`teams-roles.ts`) load the rows and call these.

type Ladders = Readonly<Record<string, readonly string[]>>

/** Two owners are the same: same type and same id (`null` for the platform). */
export function sameTeamOwner(a: TeamOwner, b: TeamOwner): boolean {
  return a.ownerType === b.ownerType && (a.ownerId ?? null) === (b.ownerId ?? null)
}

/** Whether a mapping rule covers `team`: the team itself (of the same owner), or every team of the rule's owner. */
export function mappingCoversTeam(rule: Pick<TeamRoleMappingDto, 'ownerType' | 'ownerId' | 'teamId'>, team: TeamsResolverTeam): boolean {
  if (!sameTeamOwner(rule, team)) return false
  return !rule.teamId || rule.teamId === team.id
}

/** `role` rules match a global role (teams answers them); `plan` rules are answered by a `teams:roles:resolve` listener. */
export function isRoleMatch(match: TeamRoleMatch): match is { role: string } {
  return 'role' in match
}

export function isPlanMatch(match: TeamRoleMatch): match is { plan: string } {
  return 'plan' in match
}

/**
 * The mapped grants of `rules` (all of which the user meets): one per covered team whose kind's ladder has the rule's
 * `teamRole` (a role that is not on the ladder is skipped), with the rule's `priority`. Several grants on one team are
 * reduced later (`mergeTeamGrants`).
 */
export function mappedGrantsFor(
  teams: readonly TeamsResolverTeam[],
  rules: readonly Pick<TeamRoleMappingDto, 'ownerType' | 'ownerId' | 'teamId' | 'teamRole' | 'priority'>[],
  ladders: Ladders,
): TeamsMappedGrant[] {
  const grants: TeamsMappedGrant[] = []
  for (const rule of rules) {
    for (const team of teams) {
      if (!mappingCoversTeam(rule, team)) continue
      if (teamRoleRank(ladders[team.kind], rule.teamRole) < 0) continue
      grants.push({
        ownerType: team.ownerType,
        ownerId: team.ownerId ?? null,
        teamId: team.id,
        kind: team.kind,
        role: rule.teamRole,
        source: 'mapped',
        priority: rule.priority,
      })
    }
  }
  return grants
}

/** Whether mapped grant `a` beats `b` on the same team: the higher priority, then the higher role on the ladder. */
function beats(a: TeamsMappedGrant, b: TeamsMappedGrant, ladders: Ladders): boolean {
  const pa = a.priority ?? 0
  const pb = b.priority ?? 0
  if (pa !== pb) return pa > pb
  return teamRoleRank(ladders[a.kind], a.role) > teamRoleRank(ladders[b.kind], b.role)
}

const strip = ({ ownerType, ownerId, teamId, kind, role }: TeamRoleGrant, source: TeamRoleGrant['source']): TeamRoleGrant =>
  ({ ownerType, ownerId: ownerId ?? null, teamId, kind, role, source })

/**
 * Explicit grants first (as they are), then at most one mapped grant per team that has no explicit one: the highest
 * priority wins, then the higher role on the ladder. Mapped grants for a role that is not on the team kind's ladder are
 * dropped. The result carries no `priority`.
 */
export function mergeTeamGrants(explicit: readonly TeamRoleGrant[], mapped: readonly TeamsMappedGrant[], ladders: Ladders): TeamRoleGrant[] {
  const explicitTeams = new Set(explicit.map(grant => grant.teamId))
  const best = new Map<string, TeamsMappedGrant>()
  for (const grant of mapped) {
    if (explicitTeams.has(grant.teamId)) continue
    if (teamRoleRank(ladders[grant.kind], grant.role) < 0) continue
    const current = best.get(grant.teamId)
    if (!current || beats(grant, current, ladders)) best.set(grant.teamId, grant)
  }
  return [
    ...explicit.map(grant => strip(grant, 'explicit')),
    ...[...best.values()].map(grant => strip(grant, 'mapped')),
  ]
}

/** The grants on one owner. */
export function grantsOfOwner(grants: readonly TeamRoleGrant[], owner: TeamOwner): TeamRoleGrant[] {
  return grants.filter(grant => sameTeamOwner(grant, owner))
}
