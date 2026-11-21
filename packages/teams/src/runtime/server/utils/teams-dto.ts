import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminTeamDto, TeamDto, TeamMemberDto, TeamRoleMappingDto, TeamRoleMatch, Translated } from '../../../types'

type TeamRow = typeof schema.teams.$inferSelect
type TeamMemberRow = typeof schema.teamMembers.$inferSelect
type TeamMappingRow = typeof schema.teamRoleMappings.$inferSelect

/** What anybody who may read the team sees: an allowlist of the row's fields. */
export function toTeamDto(row: TeamRow): TeamDto {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId ?? null,
    parentId: row.parentId ?? null,
    kind: row.kind,
    name: row.name,
    description: row.description ?? null,
    capacity: row.capacity ?? null,
    sort: row.sort,
  }
}

/** The staff view: the public one plus the owner's label, the explicit member count and the audit dates. */
export function toAdminTeamDto(row: TeamRow, extra: { ownerLabel: Translated | null, memberCount: number }): AdminTeamDto {
  return {
    ...toTeamDto(row),
    ownerLabel: extra.ownerLabel,
    memberCount: extra.memberCount,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** The user fields a member row shows; `email` is only copied when `pii` is set. */
export type TeamMemberUser = { name: string | null, email: string | null, avatar: string | null } | null | undefined

/** An explicit membership. The email is only in the DTO with `pii` (the caller holds `teams:pii`). */
export function toTeamMemberDto(row: TeamMemberRow, user: TeamMemberUser, pii: boolean): TeamMemberDto {
  return {
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    name: user?.name ?? null,
    avatar: user?.avatar ?? null,
    ...(pii ? { email: user?.email ?? null } : {}),
    role: row.role,
    status: row.status ?? null,
    source: 'explicit',
    addedAt: isoDate(row.createdAt),
  }
}

/** A mapped membership: resolved from a rule, never stored, so it has no id, status or date. */
export function toMappedTeamMemberDto(teamId: string, userId: number, role: string, user: TeamMemberUser, pii: boolean): TeamMemberDto {
  return {
    id: null,
    teamId,
    userId,
    name: user?.name ?? null,
    avatar: user?.avatar ?? null,
    ...(pii ? { email: user?.email ?? null } : {}),
    role,
    status: null,
    source: 'mapped',
    addedAt: null,
  }
}

export function toTeamRoleMappingDto(row: TeamMappingRow): TeamRoleMappingDto {
  return {
    id: row.id,
    ownerType: row.ownerType,
    ownerId: row.ownerId ?? null,
    teamId: row.teamId ?? null,
    match: row.match as TeamRoleMatch,
    teamRole: row.teamRole,
    priority: row.priority,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}
