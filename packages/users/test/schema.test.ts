import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { users, passwordResets, magicLinks } from '../src/runtime/db/schema.sqlite'

describe('users schema', () => {
  it('exports the base user columns in order', () => {
    expect(Object.keys(getTableColumns(users))).toEqual([
      'id',
      'name',
      'email',
      'password',
      'avatar',
      'emailVerifiedAt',
      'lastLoginAt',
      'createdAt',
      'updatedAt',
    ])
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
})
