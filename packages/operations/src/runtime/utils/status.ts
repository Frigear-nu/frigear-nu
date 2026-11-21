import type { OperationStatus } from '../../types'

/** Every status, in the order of the life cycle. */
export const OPERATION_STATUSES = ['planning', 'active', 'wrapped_up', 'archived'] as const satisfies readonly OperationStatus[]

/**
 * The allowed moves: an operation is planned, runs, is wrapped up and is archived. A plan that never happens goes
 * straight to `archived`. `archived` is final.
 */
const TRANSITIONS: Readonly<Record<OperationStatus, readonly OperationStatus[]>> = {
  planning: ['active', 'archived'],
  active: ['wrapped_up'],
  wrapped_up: ['archived'],
  archived: [],
}

/** The statuses an operation in `from` can move to. */
export function nextStatuses(from: OperationStatus): readonly OperationStatus[] {
  return TRANSITIONS[from]
}

/** Whether `from -> to` is an allowed move (a move to the same status is not). */
export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export function isOperationStatus(value: unknown): value is OperationStatus {
  return typeof value === 'string' && (OPERATION_STATUSES as readonly string[]).includes(value)
}
