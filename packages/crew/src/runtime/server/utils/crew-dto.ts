import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { CrewInviteDto, CrewMemberDto, CrewSettingsDto, CrewStatus, CrewStatusEmails, MyCrewDto, Translated } from '../../../types'

type MemberRow = typeof schema.teamMembers.$inferSelect
type InviteRow = typeof schema.crewInvites.$inferSelect
type SettingsRow = typeof schema.crewSettings.$inferSelect

/** The team fields a crew DTO shows. */
export type CrewTeamLite = { id: string, name: Translated, ownerId: string | null }
/** The user fields a crew DTO shows; `email` and `phone` are only copied with `pii`. */
export type CrewUserLite = { name: string | null, email: string | null, avatar: string | null, phone: string | null } | null | undefined

/**
 * A crew member from a membership row (with its crew columns). `pii` is whether the caller holds `crew:pii`: the email
 * and phone number are left out of the DTO without it.
 */
export function toCrewMemberDto(input: { member: MemberRow, team: CrewTeamLite, user: CrewUserLite, previous: boolean, pii: boolean }): CrewMemberDto {
  const { member, team, user, previous, pii } = input
  return {
    id: member.id,
    operationId: team.ownerId ?? '',
    teamId: team.id,
    teamName: team.name,
    userId: member.userId,
    name: user?.name ?? null,
    avatar: user?.avatar ?? null,
    ...(pii ? { email: user?.email ?? null, phone: user?.phone ?? null } : {}),
    role: member.role,
    crewStatus: member.crewStatus as CrewStatus,
    waitlistPosition: member.waitlistPosition ?? null,
    previousCrew: previous,
    appliedAt: isoDate(member.appliedAt),
    decidedAt: isoDate(member.decidedAt),
    decidedBy: member.decidedBy ?? null,
    submissionId: member.submissionId ?? null,
  }
}

/** My own crew status in one operation. */
export function toMyCrewDto(input: { member: MemberRow, team: CrewTeamLite, operation: { slug: string, name: Translated } }): MyCrewDto {
  const { member, team, operation } = input
  return {
    operationId: team.ownerId ?? '',
    operationSlug: operation.slug,
    operationName: operation.name,
    crewStatus: member.crewStatus as CrewStatus,
    teamId: team.id,
    teamName: team.name,
    role: member.role,
    waitlistPosition: member.waitlistPosition ?? null,
    appliedAt: isoDate(member.appliedAt),
    decidedAt: isoDate(member.decidedAt),
  }
}

/** Whether an invite can still be used: not revoked, not expired and with uses left. */
export function crewInviteStatus(row: Pick<InviteRow, 'revokedAt' | 'expiresAt' | 'uses' | 'maxUses'>, now = new Date()): CrewInviteDto['status'] {
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return row.uses >= row.maxUses ? 'used' : 'active'
}

/** An invite as staff see it: never the token, only its first characters. */
export function toCrewInviteDto(row: InviteRow, teamName: Translated | null): CrewInviteDto {
  return {
    id: row.id,
    operationId: row.operationId,
    teamId: row.teamId,
    teamName,
    role: row.role,
    prefix: row.prefix,
    maxUses: row.maxUses,
    uses: row.uses,
    expiresAt: isoDate(row.expiresAt),
    createdBy: row.createdBy ?? null,
    createdAt: isoDate(row.createdAt),
    revokedAt: isoDate(row.revokedAt),
    status: crewInviteStatus(row),
  }
}

/** The settings of an operation; without a stored row the defaults, as the first save would store them. */
export function toCrewSettingsDto(operationId: string, row: SettingsRow | undefined, approved: number): CrewSettingsDto {
  return {
    operationId,
    formId: row?.formId ?? null,
    defaultTeamId: row?.defaultTeamId ?? null,
    capacity: row?.capacity ?? null,
    waitlist: row?.waitlist ?? true,
    previousCrewFirst: row?.previousCrewFirst ?? false,
    opensAt: isoDate(row?.opensAt),
    closesAt: isoDate(row?.closesAt),
    statusEmails: (row?.statusEmails ?? {}) as CrewStatusEmails,
    presets: row?.presets ?? true,
    source: row ? 'stored' : 'default',
    approved,
    createdAt: isoDate(row?.createdAt),
    updatedAt: isoDate(row?.updatedAt),
  }
}
