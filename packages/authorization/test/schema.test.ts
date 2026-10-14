import { describe, it, expect } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import * as sqlite from '../src/runtime/server/db/schema.sqlite'
import * as postgresql from '../src/runtime/server/db/schema.postgresql'

const dialects = [{ dialect: 'sqlite', ...sqlite }, { dialect: 'postgresql', ...postgresql }]

describe.each(dialects)('users extension ($dialect)', ({ users }) => {
  it('adds a non-null role column defaulting to "user"', () => {
    const columns = getTableColumns(users)
    expect(Object.keys(columns)).toEqual(['role'])
    expect(columns.role.notNull).toBe(true)
    expect(columns.role.default).toBe('user')
  })
})
