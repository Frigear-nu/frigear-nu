import type { ShiftApproval, ShiftCoverage, ShiftHandover, ShiftScheduleSettings, ShiftSwapKind } from '../../types'

// How a schedule lets shifts change hands (`coverage`, `handover`, `approval`), shared by the server checks and the
// pages that hide what a schedule does not allow.

export const SHIFT_COVERAGES = ['all', 'flexible'] as const satisfies readonly ShiftCoverage[]
export const SHIFT_HANDOVERS = ['trade', 'release', 'both'] as const satisfies readonly ShiftHandover[]
export const SHIFT_APPROVALS = ['peer', 'lead'] as const satisfies readonly ShiftApproval[]
export const SHIFT_SWAP_KINDS = ['trade', 'release'] as const satisfies readonly ShiftSwapKind[]

/** The settings of a new schedule: volunteers may give shifts away and trade them, and their agreement is enough. */
export const DEFAULT_SCHEDULE_SETTINGS: ShiftScheduleSettings = { coverage: 'flexible', handover: 'both', approval: 'peer' }

/** Whether the settings fit together: with `coverage: 'all'` only `handover: 'trade'` is valid. */
export const validScheduleSettings = (settings: Pick<ShiftScheduleSettings, 'coverage' | 'handover'>): boolean =>
  settings.coverage !== 'all' || settings.handover === 'trade'

/**
 * Whether a schedule allows a kind of swap now. A `trade` keeps everybody's count, so it only needs `handover` `trade`
 * or `both`. A `release` lowers the owner's count: it needs `coverage: 'flexible'` and `handover` `release` or `both`.
 */
export function allowsSwapKind(settings: Pick<ShiftScheduleSettings, 'coverage' | 'handover'>, kind: ShiftSwapKind): boolean {
  if (kind === 'trade') return settings.handover === 'trade' || settings.handover === 'both'
  return settings.coverage === 'flexible' && (settings.handover === 'release' || settings.handover === 'both')
}

/** The kinds of swap a schedule allows now, `trade` first. */
export const allowedSwapKinds = (settings: Pick<ShiftScheduleSettings, 'coverage' | 'handover'>): ShiftSwapKind[] =>
  SHIFT_SWAP_KINDS.filter(kind => allowsSwapKind(settings, kind))

/** The kind a swap opened without one gets: `release` when the schedule allows it, else `trade`. */
export const defaultSwapKind = (settings: Pick<ShiftScheduleSettings, 'coverage' | 'handover'>): ShiftSwapKind =>
  allowsSwapKind(settings, 'release') ? 'release' : 'trade'

/** The kind of an offer: a shift in return makes it a trade, none takes a released shift over. */
export const offerKind = (offer: { offeredAssignmentId?: string | null }): ShiftSwapKind => offer.offeredAssignmentId ? 'trade' : 'release'

/** A schedule row's settings, typed. */
export const scheduleSettingsOf = (row: { coverage: string, handover: string, approval: string }): ShiftScheduleSettings => ({
  coverage: row.coverage as ShiftCoverage,
  handover: row.handover as ShiftHandover,
  approval: row.approval as ShiftApproval,
})
