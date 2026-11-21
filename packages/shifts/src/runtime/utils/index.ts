// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './chunk'
export * from './guards'
export * from './ics'
export * from './reminders'
export * from './links'
export * from './status'
export * from './time'

export type {
  ModuleOptions,
  MyShiftDetailDto,
  MyShiftDto,
  ShiftAssigneeDto,
  ShiftAssignmentChangedContext,
  ShiftAssignmentDto,
  ShiftAssignmentStatus,
  ShiftAssignResultDto,
  ShiftAttendanceContext,
  ShiftBroadcastAudience,
  ShiftBroadcastContext,
  ShiftBroadcastDto,
  ShiftBroadcastResultDto,
  ShiftCandidateDto,
  ShiftChannel,
  ShiftCheckInDto,
  ShiftCopyResultDto,
  ShiftCreatedContext,
  ShiftDto,
  ShiftFeedStatusDto,
  ShiftFeedTokenDto,
  ShiftGuards,
  ShiftLocation,
  ShiftPassDto,
  ShiftPassPerkDto,
  ShiftPerkContext,
  ShiftPerkDto,
  ShiftPerkKind,
  ShiftPerkRedeemDto,
  ShiftPerkRedemptionDto,
  ShiftPersonDto,
  ShiftReminderContext,
  ShiftRoleDto,
  ShiftScheduleContext,
  ShiftScheduleDto,
  ShiftScheduleStatus,
  ShiftsLedTeamDto,
  ShiftsNowDto,
  ShiftsOperationTeamDto,
  ShiftsRemindersOptions,
  ShiftSwapContext,
  ShiftSwapDto,
  ShiftSwapMode,
  ShiftSwapOfferDto,
  ShiftSwapOfferStatus,
  ShiftSwapStatus,
  ShiftUpdatedContext,
  ShiftWarning,
  ShiftWithAssigneesDto,
  Translated,
} from '../../types'

/** Random, prefixed id (`shf_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/** An unguessable check-in code: 64 hex characters (two UUIDs without dashes), like an events ticket code. */
export function newCheckInCode(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}
