import { describe, expect, it } from 'vitest'
import { isOperationUniqueViolation } from '../../src/runtime/server/utils/operations-errors'

describe('unique violation detection', () => {
  it('recognises the sqlite and postgresql unique errors, also wrapped in a cause', () => {
    expect(isOperationUniqueViolation(Object.assign(new Error('boom'), { code: '23505' }))).toBe(true)
    expect(isOperationUniqueViolation(Object.assign(new Error('boom'), { code: 'SQLITE_CONSTRAINT_UNIQUE' }))).toBe(true)
    expect(isOperationUniqueViolation(new Error('UNIQUE constraint failed: operations.slug'))).toBe(true)
    expect(isOperationUniqueViolation(new Error('Failed query', { cause: Object.assign(new Error('x'), { code: '23505' }) }))).toBe(true)
    expect(isOperationUniqueViolation(new Error('Failed query', { cause: new Error('UNIQUE constraint failed: operations.slug') }))).toBe(true)
  })

  it('does not take other errors for one', () => {
    expect(isOperationUniqueViolation(new Error('connection lost'))).toBe(false)
    expect(isOperationUniqueViolation(Object.assign(new Error('x'), { code: '23503' }))).toBe(false)
    expect(isOperationUniqueViolation(undefined)).toBe(false)
    expect(isOperationUniqueViolation('UNIQUE constraint failed')).toBe(false)
  })
})
