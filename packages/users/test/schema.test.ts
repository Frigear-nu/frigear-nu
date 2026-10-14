import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import * as sqlite from '../src/runtime/db/schema.sqlite'
import * as postgresql from '../src/runtime/db/schema.postgresql'

const dialects = [{ dialect: 'sqlite', ...sqlite }, { dialect: 'postgresql', ...postgresql }]

describe.each(dialects)('users schema ($dialect)', ({ users }) => {
  it('exports the base user columns in order', () => {
    expect(Object.keys(getTableColumns(users))).toEqual([
      'id',
      'name',
      'email',
      'avatar',
      'acceptedTermsAt',
      'createdAt',
      'updatedAt',
    ])
  })
})
