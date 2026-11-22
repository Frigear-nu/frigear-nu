// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './checkin'
export * from './guards'
export * from './ics'
export * from './reminders'
export * from './links'
export * from './settings'
export * from './status'
export * from './time'

export type {
  ModuleOptions,
  MyShiftDetailDto,
  MyShiftDto,
  ShiftApproval,
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
  ShiftCheckInMethod,
  ShiftCheckInMode,
  ShiftCheckInRule,
  ShiftCheckInSettings,
  ShiftCheckInTeamSettings,
  ShiftCheckInDto,
  ShiftCopyResultDto,
  ShiftCoverage,
  ShiftCreatedContext,
  ShiftDigestContext,
  ShiftDto,
  ShiftExceptionDto,
  ShiftExceptionKind,
  ShiftFeedStatusDto,
  ShiftFeedTokenDto,
  ShiftGuards,
  ShiftHandover,
  ShiftLocation,
  ShiftPassDto,
  ShiftPassPerkDto,
  ShiftPerkDto,
  ShiftEarnedPerkContext,
  ShiftEarnedPerkDto,
  ShiftEarnedPerkListDto,
  ShiftPersonDto,
  ShiftReminderContext,
  ShiftRoleDto,
  ShiftScheduleContext,
  ShiftScheduleDto,
  ShiftScheduleSettings,
  ShiftScheduleStatus,
  ShiftSelfCheckInDto,
  ShiftSelfCheckInInput,
  ShiftsAutomationOptions,
  ShiftStationDto,
  ShiftStationTokenDto,
  ShiftsLedTeamDto,
  ShiftsMyNowDto,
  ShiftsNowDto,
  ShiftsOperationTeamDto,
  ShiftsRemindersOptions,
  ShiftSwapContext,
  ShiftSwapDto,
  ShiftSwapGuardCode,
  ShiftSwapKind,
  ShiftSwapOfferDto,
  ShiftSwapOfferStatus,
  ShiftSwapStatus,
  ShiftUpdatedContext,
  ShiftWarning,
  ShiftWithAssigneesDto,
  Translated,
} from '../../types'

/** Random, prefixed id (`<prefix>_<32 hex>`): the one of `@frigear-nu/module-kit/id`. */
export { newId } from '@frigear-nu/module-kit/id'

/** An unguessable check-in code: 64 hex characters (two UUIDs without dashes), like an events ticket code. */
export function newCheckInCode(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}
