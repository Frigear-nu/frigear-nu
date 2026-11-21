import { describe, expect, it } from 'vitest'
import { OPERATION_STATUSES, canTransition, isOperationStatus, nextStatuses } from '../../src/runtime/utils'
import type { OperationStatus } from '../../src/runtime/utils'

// Every move of the status machine, spelled out: planning -> active -> wrapped_up -> archived, and planning -> archived.
const ALLOWED: Array<[OperationStatus, OperationStatus]> = [
  ['planning', 'active'],
  ['planning', 'archived'],
  ['active', 'wrapped_up'],
  ['wrapped_up', 'archived'],
]

describe('operation status transitions', () => {
  it('allows exactly the moves of the life cycle', () => {
    for (const from of OPERATION_STATUSES) {
      for (const to of OPERATION_STATUSES) {
        const expected = ALLOWED.some(([a, b]) => a === from && b === to)
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(expected)
      }
    }
  })

  it('never moves to the same status, and never leaves archived', () => {
    for (const status of OPERATION_STATUSES) expect(canTransition(status, status)).toBe(false)
    expect(nextStatuses('archived')).toEqual([])
  })

  it('lists the next statuses in life cycle order', () => {
    expect(nextStatuses('planning')).toEqual(['active', 'archived'])
    expect(nextStatuses('active')).toEqual(['wrapped_up'])
    expect(nextStatuses('wrapped_up')).toEqual(['archived'])
  })

  it('recognises statuses', () => {
    expect(isOperationStatus('wrapped_up')).toBe(true)
    expect(isOperationStatus('done')).toBe(false)
    expect(isOperationStatus(undefined)).toBe(false)
  })
})
