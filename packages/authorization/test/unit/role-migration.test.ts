import { beforeEach, describe, expect, it, vi } from 'vitest'

// The database the `users.role` migration reads: `select` resolves to the marker row (or nothing) or throws.
let selectResult: () => Promise<unknown[]> = async () => []
const selects = vi.fn()
const query = {
  from: () => query,
  where: () => query,
  limit: () => {
    selects()
    return selectResult()
  },
}
vi.mock('@nuxthub/db', () => ({
  db: {
    select: () => query,
    selectDistinct: () => ({ from: async () => [] }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  },
  schema: { users: {}, authorizationUserRoles: {}, authorizationMeta: { key: 'key' } },
}))
vi.mock('#auth/permissions', () => ({ registry: { permissions: {}, aliases: {} } }))
vi.mock('#auth/roles', () => ({ table: { roles: {}, defaultRoles: [], autoRoles: [] } }))

const { ensureAuthorizationRoleMigration, isAuthorizationDatabaseUnavailable } = await import('../../src/runtime/server/utils/authorization-roles')

describe('ensureAuthorizationRoleMigration', () => {
  beforeEach(() => {
    selects.mockClear()
  })

  it('stays quiet while the database is not available (prerender), and tries again on the next request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    selectResult = async () => {
      throw new Error('DB binding not found')
    }
    await ensureAuthorizationRoleMigration()
    expect(error).not.toHaveBeenCalled()

    // A real failure is logged, and retried too.
    selectResult = async () => {
      throw new Error('disk I/O error')
    }
    await ensureAuthorizationRoleMigration()
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()

    // Once it ran (the marker is there), it never runs again in this process.
    selectResult = async () => [{ key: 'users.role', value: 'done' }]
    await ensureAuthorizationRoleMigration()
    await ensureAuthorizationRoleMigration()
    expect(selects).toHaveBeenCalledTimes(3)
  })

  it('tells a missing database from a failed migration', () => {
    expect(isAuthorizationDatabaseUnavailable(new Error('DB binding not found'))).toBe(true)
    expect(isAuthorizationDatabaseUnavailable(new Error('no such table: users'))).toBe(false)
  })
})
