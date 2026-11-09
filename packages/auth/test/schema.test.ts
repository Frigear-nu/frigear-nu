import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import * as sqliteSchema from '../src/runtime/db/schema.sqlite'
import * as postgresqlSchema from '../src/runtime/db/schema.postgresql'
import * as sqliteUsers from '../src/runtime/db/users.sqlite'
import * as postgresqlUsers from '../src/runtime/db/users.postgresql'

const dialects = [
  { dialect: 'sqlite', ...sqliteSchema, userColumns: sqliteUsers.users },
  { dialect: 'postgresql', ...postgresqlSchema, userColumns: postgresqlUsers.users },
]

describe.each(dialects)('auth schema ($dialect)', ({ userCredentials, passwordResets, magicLinks, userColumns }) => {
  it('adds the credential columns to users', () => {
    expect(Object.keys(getTableColumns(userColumns))).toEqual(['password', 'emailVerifiedAt', 'lastLoginAt', 'sessionVersion'])
  })

  it('exports the password reset columns in order', () => {
    expect(Object.keys(getTableColumns(passwordResets))).toEqual([
      'id',
      'userId',
      'code',
      'expiresAt',
      'usedAt',
      'createdAt',
    ])
  })

  it('exports the magic link columns in order', () => {
    expect(Object.keys(getTableColumns(magicLinks))).toEqual([
      'id',
      'userId',
      'code',
      'redirectUrl',
      'expiresAt',
      'usedAt',
      'createdAt',
    ])
  })

  it('exports the passkey credential columns in order', () => {
    expect(Object.keys(getTableColumns(userCredentials))).toEqual([
      'id',
      'userId',
      'publicKey',
      'counter',
      'backedUp',
      'transports',
      'name',
      'createdAt',
    ])
  })
})
