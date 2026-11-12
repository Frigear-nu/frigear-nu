import { describe, it, expect } from 'vitest'
import { compileRoles, createPermissionRegistry, rolePermissions } from '@frigear-nu/auth/utils'
import { assignableRoles, canManageRole, isRoleBelowActor, missingForRole, planRoleAssignment } from '../../src/runtime/utils/assignment'
import type { StoredRole } from '../../src/runtime/utils/assignment'
import { permissionGrant, toRoleDetail } from '../../src/runtime/utils/roles-view'

const registry = createPermissionRegistry([
  { name: 'events:read' },
  { name: 'events:update' },
  { name: 'forms:update' },
  { name: 'users:read' },
  { name: 'users:pii', sensitive: true },
  { name: 'roles:assign', sessionOnly: true },
  { name: 'member-area:view' },
  { name: 'tickets:read', implicit: true },
]).value

const { value: table, errors } = compileRoles({
  registry,
  defaultRoles: ['user'],
  requirementNames: ['subscription'],
  roles: {
    admin: { grant: ['*', 'users:pii'] },
    manager: { grant: ['forms:update', 'users:read', 'roles:assign'], inherit: ['eventmanager'] },
    eventmanager: { grant: ['events:*'], inherit: ['user'] },
    member: { grant: ['member-area:view'], requirements: { subscription: '*' }, auto: true },
    locked: { grant: ['users:read'], assignable: false },
    user: { grant: ['events:read'] },
  },
})

const held = (...roles: string[]) => rolePermissions(roles, table, registry)
const plan = (actor: string[], current: StoredRole[], requested: string[]) =>
  planRoleAssignment({ table, registry, current, requested, actorHeld: held(...actor) })

describe('role assignment escalation', () => {
  it('compiles the fixture roles', () => {
    expect(errors).toEqual([])
  })

  it('lets an actor manage only roles strictly below them: every permission held (sensitive ones by name), and more', () => {
    const manager = held('manager', 'eventmanager', 'user')
    expect(canManageRole('eventmanager', table, registry, manager)).toBe(true)
    // Their own role is not below them: a manager cannot hand out or take away `manager`.
    expect(missingForRole('manager', table, registry, manager)).toEqual([])
    expect(isRoleBelowActor('manager', table, registry, manager)).toBe(false)
    expect(canManageRole('manager', table, registry, manager)).toBe(false)
    // The implicit permissions everyone holds do not make a peer "above" a role.
    expect(isRoleBelowActor('eventmanager', table, registry, held('eventmanager', 'user'))).toBe(false)
    // A super-admin (every registered permission, sensitive ones too) may manage their own role; `*` alone is not one.
    expect(isRoleBelowActor('admin', table, registry, held('admin'))).toBe(true)
    expect(isRoleBelowActor('admin', table, registry, ['*'])).toBe(false)
    expect(missingForRole('admin', table, registry, manager)).toContain('member-area:view')
    // `*` never covers a sensitive permission: an admin without `users:pii` by name could not manage a role holding it.
    expect(missingForRole('admin', table, registry, ['*'])).toEqual(['users:pii'])
    expect(canManageRole('admin', table, registry, held('admin'))).toBe(true)
  })

  it('lists the assignable roles: never auto, default or `assignable: false`', () => {
    expect(assignableRoles(table, registry, held('admin'))).toEqual(['admin', 'eventmanager', 'manager'])
    expect(assignableRoles(table, registry, held('manager', 'eventmanager', 'user'))).toEqual(['eventmanager'])
    expect(assignableRoles(table, registry, held('user'))).toEqual([])
  })

  it('plans the difference between stored and requested roles', () => {
    const result = plan(['admin'], [{ role: 'eventmanager', source: 'migrated' }], ['manager'])
    expect(result).toEqual({ ok: true, add: ['manager'], remove: ['eventmanager'], next: ['manager'] })
  })

  it('refuses to add or remove a role holding permissions the actor lacks (403)', () => {
    const manager = ['manager', 'eventmanager', 'user']
    expect(plan(manager, [], ['admin'])).toMatchObject({ ok: false, status: 403, code: 'forbidden', role: 'admin' })
    expect(plan(manager, [{ role: 'admin', source: 'manual' }], [])).toMatchObject({ ok: false, status: 403, role: 'admin' })
    expect(plan(manager, [], ['eventmanager'])).toMatchObject({ ok: true, add: ['eventmanager'] })
  })

  it('refuses a peer their own role, to add or remove (403 role_not_below); a super-admin may', () => {
    const manager = ['manager', 'eventmanager', 'user']
    expect(plan(manager, [], ['manager'])).toMatchObject({ ok: false, status: 403, code: 'role_not_below', role: 'manager' })
    expect(plan(manager, [{ role: 'manager', source: 'manual' }], [])).toMatchObject({ ok: false, status: 403, code: 'role_not_below', role: 'manager' })
    expect(plan(['admin'], [], ['admin'])).toMatchObject({ ok: true, add: ['admin'] })
  })

  it('answers 409 role_not_assignable for auto, default and non-assignable roles, 400 for unknown ones', () => {
    expect(plan(['admin'], [], ['member'])).toMatchObject({ ok: false, status: 409, code: 'role_not_assignable', role: 'member' })
    expect(plan(['admin'], [], ['user'])).toMatchObject({ ok: false, status: 409, code: 'role_not_assignable', role: 'user' })
    expect(plan(['admin'], [], ['locked'])).toMatchObject({ ok: false, status: 409, role: 'locked' })
    expect(plan(['admin'], [], ['ghost'])).toMatchObject({ ok: false, status: 400, code: 'unknown_role' })
  })

  it('leaves single sign-on rows alone and lets a stale unknown role be removed', () => {
    const current: StoredRole[] = [{ role: 'eventmanager', source: 'sso' }, { role: 'retired', source: 'migrated' }]
    expect(plan(['user'], current, [])).toEqual({ ok: true, add: [], remove: ['retired'], next: ['eventmanager'] })
    expect(plan(['user'], current, ['eventmanager', 'retired'])).toEqual({ ok: true, add: [], remove: [], next: ['eventmanager', 'retired'] })
  })
})

describe('roles admin view', () => {
  it('says why a role holds a permission', () => {
    const manager = table.roles.manager!
    const permission = (name: string) => registry.permissions[name]!
    expect(permissionGrant(manager, permission('forms:update'), table, registry)).toEqual({ via: 'granted', by: 'forms:update' })
    expect(permissionGrant(manager, permission('events:update'), table, registry)).toEqual({ via: 'inherited', from: 'eventmanager', by: 'events:*' })
    expect(permissionGrant(manager, permission('tickets:read'), table, registry)).toEqual({ via: 'implicit' })
    expect(permissionGrant(manager, permission('users:pii'), table, registry)).toBeNull()
    expect(permissionGrant(table.roles.admin!, permission('events:read'), table, registry)).toEqual({ via: 'granted', by: '*' })
  })

  it('builds the role detail with every registered permission', () => {
    const detail = toRoleDetail(table.roles.member!, 0, table, registry)
    expect(detail).toMatchObject({ name: 'member', auto: true, default: false, assignable: false, requirements: ['subscription'] })
    expect(detail.permissions.map(row => row.name)).toHaveLength(Object.keys(registry.permissions).length)
    expect(detail.permissions.find(row => row.name === 'member-area:view')?.grant).toEqual({ via: 'granted', by: 'member-area:view' })
    expect(detail.permissions.every(row => Array.isArray(row.sources))).toBe(true)
  })
})
