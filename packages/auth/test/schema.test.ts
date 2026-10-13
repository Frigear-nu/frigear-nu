import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { userCredentials, passwordResets, magicLinks } from '../src/runtime/db/schema.sqlite'
import { users as userColumns } from '../src/runtime/db/users.sqlite'

describe('auth schema', () => {
  it('adds the credential columns to users', () => {
    expect(Object.keys(getTableColumns(userColumns))).toEqual(['password', 'emailVerifiedAt', 'lastLoginAt'])
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
