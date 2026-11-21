import type { AdminTeamDto, TeamLadderDto, TeamMemberDto, TeamOwner, TeamRoleMappingDto, Translated } from '../../../types'

// The staff views of the admin API's DTOs.
export type StaffTeam = AdminTeamDto
export type StaffTeamMember = TeamMemberDto
export type StaffTeamMapping = TeamRoleMappingDto
export type StaffTeamLadder = TeamLadderDto

/** One page of `GET /api/admin/teams`. */
export type StaffTeamsPage = { items: AdminTeamDto[], total: number, page: number, pageSize: number }

type TranslateText = (value: Translated | null | undefined) => string

/** The owner types the admin forms offer; the API takes any owner `audience:owner:resolve` knows. */
export const TEAM_OWNER_TYPES = ['platform', 'operation'] as const

/** The label of a role key on a ladder, falling back to the key. */
export function teamRoleLabel(ladders: readonly StaffTeamLadder[] | null | undefined, kind: string, role: string, tr: TranslateText): string {
  const found = ladders?.find(ladder => ladder.kind === kind)?.roles.find(item => item.key === role)
  return found ? tr(found.label) || role : role
}

/** The select options of a kind's ladder, highest role first. */
export function teamRoleOptions(ladders: readonly StaffTeamLadder[] | null | undefined, kind: string, tr: TranslateText) {
  const ladder = ladders?.find(item => item.kind === kind)
  return [...(ladder?.roles ?? [])].reverse().map(role => ({ label: tr(role.label) || role.key, value: role.key }))
}

/** "Platform", or the owner's label, or its type and id. */
export function teamOwnerText(owner: TeamOwner & { ownerLabel?: Translated | null }, tr: TranslateText, platform: string): string {
  if (owner.ownerType === 'platform') return platform
  return tr(owner.ownerLabel) || `${owner.ownerType} ${owner.ownerId ?? ''}`.trim()
}
