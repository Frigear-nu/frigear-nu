import { describe, expect, it } from 'vitest'
import { isFaqUniqueViolation } from '../../src/runtime/server/utils/faq-errors'

describe('unique violation check', () => {
  it('recognises sqlite and postgresql, also behind a cause', () => {
    expect(isFaqUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
    expect(isFaqUniqueViolation(new Error('UNIQUE constraint failed: faq_groups.slug'))).toBe(true)
    expect(isFaqUniqueViolation({ code: '23505' })).toBe(true)
    expect(isFaqUniqueViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(true)
  })

  it('does not take other errors for one', () => {
    expect(isFaqUniqueViolation(new Error('boom'))).toBe(false)
    expect(isFaqUniqueViolation({ code: '23503' })).toBe(false)
    // Another sqlite constraint, such as a foreign key or a not-null, is not a slug conflict.
    expect(isFaqUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false)
    expect(isFaqUniqueViolation({ code: 'SQLITE_CONSTRAINT_NOTNULL' })).toBe(false)
    expect(isFaqUniqueViolation({ code: 'SQLITE_CONSTRAINT' })).toBe(false)
    expect(isFaqUniqueViolation(null)).toBe(false)
  })
})
