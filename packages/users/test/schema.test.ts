import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { text } from 'drizzle-orm/sqlite-core'
import { defineUsersTable } from '../src/runtime/db/schema.sqlite'

describe('defineUsersTable', () => {
  it('keeps the base columns first and places extended columns last', () => {
    const table = defineUsersTable({
      name: 'users',
      columns: {
        locale: text().default('da'),
        stripeCustomerId: text(),
      },
    })

    expect(Object.keys(getTableColumns(table))).toEqual([
      'id',
      'name',
      'email',
      'password',
      'avatar',
      'createdAt',
      'updatedAt',
      'locale',
      'stripeCustomerId',
    ])
  })
})
