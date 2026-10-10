import { describe, it, expect } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { users } from '../src/runtime/server/db/schema.sqlite'

describe('users extension', () => {
  it('adds a non-null role column defaulting to "user"', () => {
    const columns = getTableColumns(users)
    expect(Object.keys(columns)).toEqual(['role'])
    expect(columns.role.notNull).toBe(true)
    expect(columns.role.default).toBe('user')
  })
})
