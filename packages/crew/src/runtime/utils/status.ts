import type { CrewStatus } from '../../types'

/** Every crew status, in the order they usually happen. */
export const CREW_STATUSES = ['applied', 'waitlisted', 'approved', 'rejected', 'withdrawn'] as const satisfies readonly CrewStatus[]

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  applied: 'Applied',
  waitlisted: 'Waiting list',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const isCrewStatus = (value: unknown): value is CrewStatus =>
  typeof value === 'string' && (CREW_STATUSES as readonly string[]).includes(value)

/** The `status` crew stores on the team membership for a crew status: only an approved person is `active`. */
export function teamStatusOf(status: CrewStatus): 'pending' | 'active' | 'inactive' {
  if (status === 'approved') return 'active'
  return status === 'applied' || status === 'waitlisted' ? 'pending' : 'inactive'
}

/** Whether a crew status holds the team role (the teams membership rule: `active` grants, anything else is listed only). */
export const crewStatusGrants = (status: CrewStatus | null | undefined) => status === 'approved'

/** The moves staff can make, by current status. A withdrawn person has left: only they can come back, by applying again. */
export const CREW_TRANSITIONS: Record<CrewStatus, readonly CrewStatus[]> = {
  applied: ['approved', 'rejected', 'waitlisted'],
  waitlisted: ['approved', 'rejected'],
  approved: ['rejected', 'waitlisted'],
  rejected: ['approved', 'waitlisted'],
  withdrawn: [],
}

export const canMoveCrew = (from: CrewStatus, to: CrewStatus) => CREW_TRANSITIONS[from].includes(to)

/** Statuses that count as "has applied and is still in the running". */
export const OPEN_CREW_STATUSES = ['applied', 'waitlisted', 'approved'] as const satisfies readonly CrewStatus[]
