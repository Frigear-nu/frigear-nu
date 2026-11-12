import { describe, it, expect } from 'vitest'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { getTableConfig as sqliteConfig } from 'drizzle-orm/sqlite-core'
import { getTableConfig as pgConfig } from 'drizzle-orm/pg-core'
import * as sqlite from '../src/runtime/server/db/schema.sqlite'
import * as postgresql from '../src/runtime/server/db/schema.postgresql'
import * as usersSqlite from '../src/runtime/server/db/users.sqlite'
import * as usersPostgresql from '../src/runtime/server/db/users.postgresql'

describe.each([{ dialect: 'sqlite', ...usersSqlite }, { dialect: 'postgresql', ...usersPostgresql }])('users extension ($dialect)', ({ users }) => {
  it('keeps the legacy non-null role column (read once by the role migration)', () => {
    const columns = getTableColumns(users)
    expect(Object.keys(columns)).toEqual(['role'])
    expect(columns.role.notNull).toBe(true)
    expect(columns.role.default).toBe('user')
  })
})

describe('authorization_user_roles', () => {
  it('is keyed by user and role, with an index on role', () => {
    const tables = [
      sqliteConfig(sqlite.authorizationUserRoles),
      pgConfig(postgresql.authorizationUserRoles),
    ]
    for (const config of tables) {
      expect(config.name).toBe('authorization_user_roles')
      expect(config.columns.map(column => column.name).sort()).toEqual(['created_at', 'granted_by', 'role', 'source', 'user_id'])
      expect(config.primaryKeys[0]!.columns.map(column => column.name)).toEqual(['user_id', 'role'])
      expect(config.indexes.map(index => index.config.name)).toEqual(['authorization_user_roles_role_idx'])
    }
    expect(getTableName(sqlite.authorizationMeta)).toBe('authorization_meta')
  })
})
