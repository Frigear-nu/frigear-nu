import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type {
  ShiftAssignmentDto,
  ShiftAssignmentStatus,
  ShiftBroadcastDto,
  ShiftChannel,
  ShiftDto,
  ShiftGuards,
  ShiftLocation,
  ShiftPerkDto,
  ShiftPerkKind,
  ShiftPerkRedemptionDto,
  ShiftPersonDto,
  ShiftRoleDto,
  ShiftScheduleDto,
  ShiftScheduleStatus,
  ShiftSwapOfferDto,
  ShiftSwapOfferStatus,
  Translated,
} from '../../../types'
import { effectiveCapacity } from '../../utils/guards'
import { scheduleSettingsOf } from '../../utils/settings'

export type ShiftScheduleRow = typeof schema.shiftSchedules.$inferSelect
export type ShiftRoleRow = typeof schema.shiftRoles.$inferSelect
export type ShiftRow = typeof schema.shifts.$inferSelect
export type ShiftAssignmentRow = typeof schema.shiftAssignments.$inferSelect
export type ShiftSwapRow = typeof schema.shiftSwaps.$inferSelect
export type ShiftSwapOfferRow = typeof schema.shiftSwapOffers.$inferSelect

/** The user fields shifts shows; `email` and `phone` are only copied with `pii`. */
export type ShiftUserLite = { name: string | null, email: string | null, avatar: string | null, phone: string | null }

export function toShiftScheduleDto(row: ShiftScheduleRow, shiftCount?: number): ShiftScheduleDto {
  return {
    id: row.id,
    operationId: row.operationId,
    name: row.name as Translated,
    status: row.status as ShiftScheduleStatus,
    ...scheduleSettingsOf(row),
    minPerShift: row.minPerShift ?? null,
    maxPerShift: row.maxPerShift ?? null,
    guards: (row.guards ?? {}) as ShiftGuards,
    publishedAt: isoDate(row.publishedAt),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    ...(shiftCount === undefined ? {} : { shiftCount }),
  }
}

export function toShiftRoleDto(row: ShiftRoleRow): ShiftRoleDto {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    teamId: row.teamId,
    teamRole: row.teamRole ?? null,
    name: row.name as Translated,
    createdAt: isoDate(row.createdAt),
  }
}

export function toShiftDto(row: ShiftRow, schedule: Pick<ShiftScheduleRow, 'operationId' | 'maxPerShift'>): ShiftDto {
  return {
    id: row.id,
    scheduleId: row.scheduleId,
    operationId: schedule.operationId,
    teamId: row.teamId,
    shiftRoleId: row.shiftRoleId ?? null,
    startsAt: isoDate(row.startsAt),
    endsAt: isoDate(row.endsAt),
    location: (row.location ?? null) as ShiftLocation | null,
    capacity: row.capacity ?? null,
    effectiveCapacity: effectiveCapacity({ capacity: row.capacity ?? null }, { maxPerShift: schedule.maxPerShift ?? null }),
    notes: (row.notes ?? null) as Translated | null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** An assignment, never with its check-in code (the pass route is the only place that shows it). */
export function toShiftAssignmentDto(row: ShiftAssignmentRow): ShiftAssignmentDto {
  return {
    id: row.id,
    shiftId: row.shiftId,
    userId: row.userId,
    shiftRoleId: row.shiftRoleId ?? null,
    status: row.status as ShiftAssignmentStatus,
    checkedInAt: isoDate(row.checkedInAt),
    checkedInBy: row.checkedInBy ?? null,
    assignedBy: row.assignedBy ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** A person; the email and phone number only with `pii`. */
export function toShiftPersonDto(userId: number, user: ShiftUserLite | undefined, pii: boolean): ShiftPersonDto {
  return {
    userId,
    name: user?.name ?? null,
    avatar: user?.avatar ?? null,
    ...(pii ? { email: user?.email ?? null, phone: user?.phone ?? null } : {}),
  }
}

export type ShiftBroadcastRow = typeof schema.shiftBroadcasts.$inferSelect
export type ShiftPerkRow = typeof schema.shiftPerks.$inferSelect
export type ShiftPerkRedemptionRow = typeof schema.shiftPerkRedemptions.$inferSelect

export function toShiftBroadcastDto(row: ShiftBroadcastRow): ShiftBroadcastDto {
  return {
    id: row.id,
    operationId: row.operationId,
    teamId: row.teamId ?? null,
    shiftId: row.shiftId ?? null,
    teamRole: row.teamRole ?? null,
    channels: row.channels as ShiftChannel[],
    subject: row.subject as Translated,
    message: row.message as Translated,
    recipientCount: row.recipientCount,
    sentBy: row.sentBy,
    createdAt: isoDate(row.createdAt),
  }
}

export function toShiftPerkDto(row: ShiftPerkRow, redeemed?: number): ShiftPerkDto {
  return {
    id: row.id,
    operationId: row.operationId,
    teamId: row.teamId ?? null,
    kind: row.kind as ShiftPerkKind,
    name: row.name as Translated,
    perShift: row.perShift ?? null,
    perPerson: row.perPerson ?? null,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
    ...(redeemed === undefined ? {} : { redeemed }),
  }
}

export function toShiftPerkRedemptionDto(row: ShiftPerkRedemptionRow): ShiftPerkRedemptionDto {
  return {
    id: row.id,
    perkId: row.perkId,
    assignmentId: row.assignmentId,
    userId: row.userId,
    redeemedAt: isoDate(row.redeemedAt),
    redeemedBy: row.redeemedBy,
  }
}

export function toShiftSwapOfferDto(row: ShiftSwapOfferRow, extra: Pick<ShiftSwapOfferDto, 'person' | 'offeredShift'> = {}): ShiftSwapOfferDto {
  return {
    id: row.id,
    swapId: row.swapId,
    userId: row.userId,
    offeredAssignmentId: row.offeredAssignmentId ?? null,
    status: row.status as ShiftSwapOfferStatus,
    decidedAt: isoDate(row.decidedAt),
    approvedBy: row.approvedBy ?? null,
    createdAt: isoDate(row.createdAt),
    ...extra,
  }
}
