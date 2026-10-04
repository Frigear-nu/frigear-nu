import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { users } from '../src/runtime/db/schema.sqlite'

describe('users table', () => {
  it('exports the base columns in schema order', () => {
    expect(Object.keys(getTableColumns(users))).toEqual([
      'id',
      'name',
      'email',
      'password',
      'avatar',
      'createdAt',
      'updatedAt',
    ])
  })
})
