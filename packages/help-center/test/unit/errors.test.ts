import { describe, expect, it } from 'vitest'
import { isHelpCenterForeignKeyViolation, isHelpCenterUniqueViolation } from '../../src/runtime/server/utils/help-center-errors'

describe('unique violation check', () => {
  it('recognises sqlite and postgresql, also behind a cause', () => {
    expect(isHelpCenterUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
    expect(isHelpCenterUniqueViolation(new Error('UNIQUE constraint failed: help_articles.slug'))).toBe(true)
    expect(isHelpCenterUniqueViolation({ code: '23505' })).toBe(true)
    expect(isHelpCenterUniqueViolation(new Error('Failed query', { cause: { code: '23505' } }))).toBe(true)
  })

  it('does not take other errors for one', () => {
    expect(isHelpCenterUniqueViolation(new Error('boom'))).toBe(false)
    expect(isHelpCenterUniqueViolation({ code: '23503' })).toBe(false)
    expect(isHelpCenterUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false)
    expect(isHelpCenterUniqueViolation({ code: 'SQLITE_CONSTRAINT' })).toBe(false)
    expect(isHelpCenterUniqueViolation(null)).toBe(false)
  })
})

describe('foreign key violation check', () => {
  it('recognises sqlite and postgresql, also behind a cause', () => {
    expect(isHelpCenterForeignKeyViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(true)
    expect(isHelpCenterForeignKeyViolation(new Error('FOREIGN KEY constraint failed'))).toBe(true)
    expect(isHelpCenterForeignKeyViolation({ code: '23503' })).toBe(true)
    expect(isHelpCenterForeignKeyViolation(new Error('Failed query', { cause: { code: '23503' } }))).toBe(true)
  })

  it('does not take a unique violation for one', () => {
    expect(isHelpCenterForeignKeyViolation({ code: '23505' })).toBe(false)
    expect(isHelpCenterForeignKeyViolation(new Error('UNIQUE constraint failed'))).toBe(false)
    expect(isHelpCenterForeignKeyViolation(undefined)).toBe(false)
  })
})
