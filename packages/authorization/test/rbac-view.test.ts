import { describe, expect, it } from 'vitest'
import { compileRbac } from '../src/runtime/utils/rbac'
import type { RbacScope } from '../src/runtime/utils/rbac'
import { heldPermissionCount, permissionMatrix, rbacGrantFor, rolePermissionRows } from '../src/runtime/utils/rbac-view'

const scopes: RbacScope[] = [
  { name: 'reports:read', aggregateTo: ['user'] },
  { name: 'reports:write' },
  { name: 'reports:pii' },
  { name: 'events:manage' },
]

const { table } = compileRbac({
  scopes,
  config: { hierarchy: ['admin', 'editor', 'user'], grant: { editor: ['reports:write', 'events:*'] } },
})
const role = (name: string) => table.roles.find(candidate => candidate.name === name)!

describe('rbac view (roles admin)', () => {
  it('says why a role holds a permission, through wildcards too', () => {
    expect(rbacGrantFor(role('user'), 'reports:read')).toEqual({ via: 'aggregated' })
    expect(rbacGrantFor(role('editor'), 'reports:read')).toEqual({ via: 'inherited', from: 'user' })
    expect(rbacGrantFor(role('editor'), 'reports:write')).toEqual({ via: 'granted' })
    expect(rbacGrantFor(role('editor'), 'events:manage')).toEqual({ via: 'granted' })
    // Admin inherits what its juniors hold; `*` covers the rest.
    expect(rbacGrantFor(role('admin'), 'reports:write')).toEqual({ via: 'inherited', from: 'editor' })
    expect(rbacGrantFor(compileRbac({ scopes }).table.roles[0]!, 'reports:write')).toEqual({ via: 'all' })
    expect(rbacGrantFor(role('user'), 'reports:write')).toBeNull()
  })

  it('never covers personal data with a wildcard', () => {
    expect(rbacGrantFor(role('editor'), 'reports:pii')).toBeNull()
    expect(rbacGrantFor(role('admin'), 'reports:pii')).toEqual({ via: 'all' })
  })

  it('lists every registered permission, then the wildcards a role holds', () => {
    const rows = rolePermissionRows(role('editor'), scopes)
    expect(rows.map(row => row.name)).toEqual(['events:manage', 'reports:pii', 'reports:read', 'reports:write', 'events:*'])
    expect(rows.find(row => row.name === 'reports:pii')).toMatchObject({ pii: true, resource: 'reports', grant: null })
    expect(rows.at(-1)).toMatchObject({ wildcard: true, resource: 'events', grant: { via: 'granted' } })
    expect(heldPermissionCount(role('editor'), scopes)).toBe(3)
    expect(heldPermissionCount(role('admin'), scopes)).toBe(4)
  })

  it('builds the matrix in hierarchy order', () => {
    const matrix = permissionMatrix(table, scopes)
    expect(matrix.roles.map(entry => entry.name)).toEqual(['admin', 'editor', 'user'])
    expect(matrix.permissions.find(row => row.name === 'reports:write')!.holders).toEqual({
      admin: { via: 'inherited', from: 'editor' },
      editor: { via: 'granted' },
      user: null,
    })
  })
})
