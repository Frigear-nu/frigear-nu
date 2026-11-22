import type { ShiftAssignmentStatus, ShiftSwapOfferStatus, ShiftSwapStatus } from '../../types'

export const SHIFT_ASSIGNMENT_STATUSES = ['assigned', 'attended', 'no_show', 'cancelled'] as const satisfies readonly ShiftAssignmentStatus[]
export const SHIFT_SWAP_STATUSES = ['open', 'offered', 'accepted', 'pending_approval', 'completed', 'rejected', 'cancelled'] as const satisfies readonly ShiftSwapStatus[]
export const SHIFT_SWAP_OFFER_STATUSES = ['offered', 'accepted', 'rejected', 'withdrawn', 'superseded'] as const satisfies readonly ShiftSwapOfferStatus[]

export const SHIFT_ASSIGNMENT_STATUS_LABELS: Record<ShiftAssignmentStatus, string> = {
  assigned: 'Assigned',
  attended: 'Attended',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

export const SHIFT_SWAP_STATUS_LABELS: Record<ShiftSwapStatus, string> = {
  open: 'Open',
  offered: 'Offers waiting',
  accepted: 'Accepted',
  pending_approval: 'Waiting for approval',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export const SHIFT_SWAP_OFFER_STATUS_LABELS: Record<ShiftSwapOfferStatus, string> = {
  offered: 'Offered',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  superseded: 'Not chosen',
}

/** The statuses that hold a place on the shift: they count towards the capacity and the guards. */
export const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'attended'] as const satisfies readonly ShiftAssignmentStatus[]

export const isActiveAssignment = (status: string) => (ACTIVE_ASSIGNMENT_STATUSES as readonly string[]).includes(status)

/** The moves of an assignment. A cancelled assignment stays cancelled (assign the person again instead). */
export const ASSIGNMENT_TRANSITIONS: Record<ShiftAssignmentStatus, readonly ShiftAssignmentStatus[]> = {
  assigned: ['attended', 'no_show', 'cancelled'],
  attended: ['no_show'],
  no_show: ['attended', 'cancelled'],
  cancelled: [],
}

export const canMoveAssignment = (from: ShiftAssignmentStatus, to: ShiftAssignmentStatus) => ASSIGNMENT_TRANSITIONS[from].includes(to)

/**
 * The moves of a swap. `offered` goes back to `open` when the last offer is withdrawn or rejected. Accepting claims the
 * swap (`accepted` in peer mode, `pending_approval` in approval mode); an approval claims it again (`accepted`) and the
 * exchange completes it. An approver's rejection puts it back to `open`.
 */
export const SWAP_TRANSITIONS: Record<ShiftSwapStatus, readonly ShiftSwapStatus[]> = {
  open: ['offered', 'cancelled'],
  offered: ['open', 'accepted', 'pending_approval', 'cancelled'],
  accepted: ['completed', 'offered', 'open', 'pending_approval'],
  pending_approval: ['accepted', 'open', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
}

export const canMoveSwap = (from: ShiftSwapStatus, to: ShiftSwapStatus) => SWAP_TRANSITIONS[from].includes(to)

/** The swaps still in play: one per assignment at a time. */
export const LIVE_SWAP_STATUSES = ['open', 'offered', 'accepted', 'pending_approval'] as const satisfies readonly ShiftSwapStatus[]

export const isLiveSwap = (status: string) => (LIVE_SWAP_STATUSES as readonly string[]).includes(status)
