import type { TeamRoleGrant, TeamsClaimEntry } from '../../types'

/** The scopes that let an OAuth application see the `teams` claim: the named scope `teams`, or `teams:read` itself. */
export const TEAMS_CLAIM_SCOPES = ['teams', 'teams:read'] as const

/** Whether the granted scopes include one of {@link TEAMS_CLAIM_SCOPES}. */
export function scopeAllowsTeamsClaim(scope: readonly string[]): boolean {
  return scope.some(item => (TEAMS_CLAIM_SCOPES as readonly string[]).includes(item))
}

/** The `teams` claim: one entry per grant, the team id as `id`. */
export function teamsClaim(grants: readonly TeamRoleGrant[]): TeamsClaimEntry[] {
  return grants.map(grant => ({
    id: grant.teamId,
    ownerType: grant.ownerType,
    ownerId: grant.ownerId ?? null,
    kind: grant.kind,
    role: grant.role,
    source: grant.source,
  }))
}
