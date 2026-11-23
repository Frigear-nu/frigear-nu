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

/**
 * The moves staff can make, by current status. Volunteers do not withdraw themselves: staff mark a person who stepped
 * down as withdrawn. A withdrawn person has left: only they can come back, by applying again (or staff add them).
 */
export const CREW_TRANSITIONS: Record<CrewStatus, readonly CrewStatus[]> = {
  applied: ['approved', 'rejected', 'waitlisted', 'withdrawn'],
  waitlisted: ['approved', 'rejected', 'withdrawn'],
  approved: ['rejected', 'waitlisted', 'withdrawn'],
  rejected: ['approved', 'waitlisted'],
  withdrawn: [],
}

export const canMoveCrew = (from: CrewStatus, to: CrewStatus) => CREW_TRANSITIONS[from].includes(to)

/** Statuses that count as "has applied and is still in the running". */
export const OPEN_CREW_STATUSES = ['applied', 'waitlisted', 'approved'] as const satisfies readonly CrewStatus[]

/** An i18n key of the crew namespace and its English fallback. */
export type CrewText = { key: string, fallback: string }

/** How the apply page tells a person who has applied where they stand (`CrewApplyDto` state `applied`). */
export type CrewApplyNotice = {
  icon: string
  color: 'success' | 'neutral'
  title: CrewText
  description: CrewText
}

/**
 * The apply page's notice for the person's crew status when the state is `applied`. Waitlisted people get their own
 * heading, in the neutral colour of their status badge; applied and approved people get the green "applied" notice.
 * Crew sends a status message on each change the texts promise (approved, rejected, waitlisted, and approved again
 * when a place opens up), unless an operation turns that status's message off. `submitted`: the form was sent just now.
 */
export function crewApplyNotice(status: CrewStatus | null, submitted = false): CrewApplyNotice {
  if (status === 'waitlisted') {
    return {
      icon: 'i-lucide-hourglass',
      color: 'neutral',
      title: { key: 'apply.waitlisted', fallback: 'You\'re on the waiting list' },
      description: { key: 'apply.waitlistedDescription', fallback: 'You\'re on the waiting list. We will email you if a place opens up.' },
    }
  }
  return {
    icon: 'i-lucide-circle-check',
    color: 'success',
    title: submitted ? { key: 'apply.thanks', fallback: 'Thank you for applying' } : { key: 'apply.alreadyApplied', fallback: 'You have applied already' },
    description: status === 'approved'
      ? { key: 'apply.approved', fallback: 'You are on the crew.' }
      : { key: 'apply.receivedDescription', fallback: 'We have received your application. We will email you when something changes.' },
  }
}
