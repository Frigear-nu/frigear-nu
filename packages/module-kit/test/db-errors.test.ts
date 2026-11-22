import { describe, expect, it } from 'vitest'
import { isForeignKeyViolation, isUniqueViolation } from '../src/runtime/server'

const wrapped = (cause: unknown) => new Error('Failed query: insert into ...', { cause })

describe('isUniqueViolation', () => {
  it('recognises unique and primary-key violations on sqlite, libsql and D1', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' })).toBe(true)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT', extendedCode: 'SQLITE_CONSTRAINT_UNIQUE' })).toBe(true)
    expect(isUniqueViolation(new Error('D1_ERROR: UNIQUE constraint failed: teams.slug: SQLITE_CONSTRAINT'))).toBe(true)
    expect(isUniqueViolation(wrapped(new Error('UNIQUE constraint failed: teams.id')))).toBe(true)
  })

  it('recognises a postgres unique violation (23505), also wrapped by drizzle', () => {
    const pg = Object.assign(new Error('duplicate key value violates unique constraint "teams_slug_unique"'), { code: '23505', severity: 'ERROR' })
    expect(isUniqueViolation(pg)).toBe(true)
    expect(isUniqueViolation(wrapped(pg))).toBe(true)
  })

  it('is false for every other constraint and error', () => {
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT', extendedCode: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(false)
    expect(isUniqueViolation(new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT'))).toBe(false)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_NOTNULL' })).toBe(false)
    expect(isUniqueViolation(new Error('NOT NULL constraint failed: teams.name'))).toBe(false)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT_CHECK' })).toBe(false)
    expect(isUniqueViolation(new Error('CHECK constraint failed: capacity'))).toBe(false)
    expect(isUniqueViolation({ code: 'SQLITE_CONSTRAINT' })).toBe(false)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation({ code: '23502' })).toBe(false)
    expect(isUniqueViolation(new Error('connection lost'))).toBe(false)
    expect(isUniqueViolation('UNIQUE constraint failed')).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
  })
})

describe('isForeignKeyViolation', () => {
  it('recognises foreign-key violations on sqlite, D1 and postgres', () => {
    expect(isForeignKeyViolation({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' })).toBe(true)
    expect(isForeignKeyViolation(new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT'))).toBe(true)
    expect(isForeignKeyViolation(wrapped({ code: '23503' }))).toBe(true)
  })

  it('is false for a unique violation and other errors', () => {
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false)
    expect(isForeignKeyViolation(new Error('UNIQUE constraint failed: teams.slug'))).toBe(false)
    expect(isForeignKeyViolation({ code: 'SQLITE_CONSTRAINT_NOTNULL' })).toBe(false)
    expect(isForeignKeyViolation(undefined)).toBe(false)
  })
})
