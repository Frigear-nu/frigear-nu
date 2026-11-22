import { describe, expect, it } from 'vitest'
import { rethrowOperationSlugConflict } from '../../src/runtime/server/utils/operations-errors'

const caught = (error: unknown) => {
  try {
    rethrowOperationSlugConflict(error)
  }
  catch (thrown) {
    return thrown as { statusCode?: number, data?: { code?: string } }
  }
  throw new Error('rethrowOperationSlugConflict returned')
}

describe('rethrowOperationSlugConflict', () => {
  it('answers 409 conflict for a unique violation of the slug', () => {
    for (const error of [
      new Error('D1_ERROR: UNIQUE constraint failed: operations.slug: SQLITE_CONSTRAINT'),
      new Error('Failed query', { cause: Object.assign(new Error('duplicate key'), { code: '23505' }) }),
    ]) {
      expect(caught(error)).toMatchObject({ statusCode: 409, data: { code: 'conflict' } })
    }
  })

  it('rethrows a foreign-key or NOT NULL failure as it is, never as a 409', () => {
    for (const error of [
      Object.assign(new Error('FOREIGN KEY constraint failed'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }),
      new Error('Failed query', { cause: Object.assign(new Error('violates foreign key constraint'), { code: '23503' }) }),
      Object.assign(new Error('NOT NULL constraint failed: operations.name'), { code: 'SQLITE_CONSTRAINT_NOTNULL' }),
    ]) {
      expect(caught(error)).toBe(error)
    }
  })
})
