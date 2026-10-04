import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { users } from '../src/runtime/db/schema.sqlite'

describe('users schema', () => {
  it('exports the base user columns in order', () => {
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
