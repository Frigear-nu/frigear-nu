import { describe, expect, it } from 'vitest'
import { canAssignRole, compileRbac, roleOf } from '../src/runtime/utils/rbac'
import type { RbacScope } from '../src/runtime/utils/rbac'

const scopes: RbacScope[] = [
  { name: 'tickets:read', aggregateTo: ['user'] },
  { name: 'tickets:write', aggregateTo: ['user'] },
  { name: 'events:manage', aggregateTo: ['eventmanager'] },
  { name: 'events:pii', aggregateTo: ['eventmanager'] },
  { name: 'forms:manage' },
  { name: 'forms:pii' },
  { name: 'payments:read', roles: ['user'] },
]

const role = (result: ReturnType<typeof compileRbac>, name: string) => result.table.roles.find(candidate => candidate.name === name)!

describe('compileRbac: zero config', () => {
  const result = compileRbac({ scopes })

  it('has admin above user', () => {
    expect(result.errors).toEqual([])
    expect(result.table.roles.map(candidate => candidate.name)).toEqual(['admin', 'user'])
    expect(result.table.defaultRole).toBe('user')
  })

  it('gives user the permissions aggregated to it (and the deprecated roles field)', () => {
    expect(role(result, 'user').permissions).toEqual(['payments:read', 'tickets:read', 'tickets:write'])
  })

  it('gives admin everything, every :pii permission by name', () => {
    const admin = role(result, 'admin')
    expect(admin.permissions).toContain('*')
    expect(admin.permissions).toEqual(expect.arrayContaining(['events:pii', 'forms:pii']))
    expect(admin.grants['tickets:read']).toEqual({ via: 'inherited', from: 'user' })
  })

  it('warns about a permission aggregated to a role the app lacks, and about admin-only permissions', () => {
    expect(result.warnings.join('\n')).toContain('"events:manage" aggregates to role "eventmanager"')
    expect(result.warnings.join('\n')).toContain('"forms:manage" is held by admin only')
  })
})

describe('compileRbac: module roles', () => {
  const result = compileRbac({ scopes, moduleRoles: [{ name: 'eventmanager', label: 'Event manager' }] })

  it('slots a module role between admin and user by default', () => {
    expect(result.errors).toEqual([])
    expect(result.table.roles.map(candidate => candidate.name)).toEqual(['admin', 'eventmanager', 'user'])
    const eventmanager = role(result, 'eventmanager')
    expect(eventmanager.permissions).toEqual(['events:manage', 'events:pii', 'payments:read', 'tickets:read', 'tickets:write'])
    expect(eventmanager.grants['events:manage']).toEqual({ via: 'aggregated' })
    expect(role(result, 'admin').juniors).toEqual(expect.arrayContaining(['eventmanager', 'user']))
  })
})

describe('compileRbac: host hierarchy, grants and revokes', () => {
  const result = compileRbac({
    scopes,
    moduleRoles: [{ name: 'eventmanager' }],
    config: {
      hierarchy: ['admin', 'manager', 'coordinator', 'eventmanager', 'crew', 'user'],
      grant: { coordinator: ['forms:*'], crew: ['tickets:*'] },
      revoke: { user: ['payments:read'] },
      labels: { crew: 'Crew' },
    },
  })

  it('chains the listed roles, most senior first', () => {
    expect(result.errors).toEqual([])
    expect(result.table.roles.map(candidate => candidate.name)).toEqual(['admin', 'manager', 'coordinator', 'eventmanager', 'crew', 'user'])
    expect(role(result, 'manager').inherits).toEqual(['coordinator'])
    expect(role(result, 'crew').label).toBe('Crew')
  })

  it('passes wildcard grants up the hierarchy, never covering :pii', () => {
    expect(role(result, 'manager').permissions).toEqual(expect.arrayContaining(['forms:*', 'events:manage', 'events:pii', 'tickets:*']))
    expect(role(result, 'manager').permissions).not.toContain('forms:pii')
    expect(role(result, 'manager').grants['forms:*']).toEqual({ via: 'inherited', from: 'coordinator' })
  })

  it('revokes from the role and the roles above it', () => {
    expect(role(result, 'user').permissions).not.toContain('payments:read')
    expect(role(result, 'crew').permissions).not.toContain('payments:read')
  })
})

describe('compileRbac: validation', () => {
  it('stops on unknown roles, unknown permissions and cycles', () => {
    const { errors } = compileRbac({
      scopes,
      config: {
        grant: { ghost: ['tickets:read'], user: ['nope:read', 'events:*'] },
        defaultRole: 'guest',
        definitions: [{ name: 'a', inherits: ['b'], inheritedBy: [] }, { name: 'b', inherits: ['a'], inheritedBy: [] }],
      },
    })
    expect(errors.join('\n')).toContain('unknown role "ghost"')
    expect(errors.join('\n')).toContain('unknown permission "nope:read"')
    expect(errors.join('\n')).not.toContain('"events:*"')
    expect(errors.join('\n')).toContain('defaultRole names unknown role "guest"')
    expect(errors.join('\n')).toContain('cycle')
  })
})

describe('compileRbac: strict validation', () => {
  const errorsOf = (config: Parameters<typeof compileRbac>[0]['config'], moduleRoles?: Parameters<typeof compileRbac>[0]['moduleRoles']) =>
    compileRbac({ scopes, moduleRoles, config }).errors.join('\n')

  it('stops on a hierarchy that does not start with admin', () => {
    expect(errorsOf({ hierarchy: ['manager', 'user'] })).toContain('hierarchy starts with "manager": it must start with "admin"')
  })

  it('ranks admin above every role without a hierarchy, also roles admin does not inherit', () => {
    const result = compileRbac({
      scopes,
      moduleRoles: [{ name: 'eventmanager' }],
      config: { definitions: [{ name: 'auditor', inheritedBy: [] }, { name: 'lead', inherits: ['eventmanager', 'auditor'], inheritedBy: [] }] },
    })
    expect(result.errors).toEqual([])
    expect(result.table.roles[0]!.name).toBe('admin')
    for (const other of ['eventmanager', 'auditor', 'lead', 'user']) {
      expect(canAssignRole(result.table, 'admin', other)).toBe(true)
      expect(canAssignRole(result.table, other, 'admin')).toBe(false)
    }
  })

  it('stops on an unknown role in inheritedBy, but accepts one created by hierarchy', () => {
    expect(errorsOf({ definitions: [{ name: 'auditor', inheritedBy: ['mangaer'] }] })).toContain('Role "auditor" is inherited by unknown role "mangaer"')
    expect(errorsOf({ hierarchy: ['admin', 'manager', 'user'], definitions: [{ name: 'auditor', inheritedBy: ['manager'] }] })).toBe('')
  })

  it('stops on an unknown role in inherits', () => {
    expect(errorsOf({ definitions: [{ name: 'auditor', inherits: ['ghost'] }] })).toContain('Role "auditor" inherits unknown role "ghost"')
    expect(errorsOf({ hierarchy: ['admin', 'manager', 'user'], inherits: { manager: ['ghost'] } })).toContain('Role "manager" inherits unknown role "ghost"')
  })

  it('stops on admin as the default role', () => {
    expect(errorsOf({ defaultRole: 'admin' })).toContain('defaultRole is "admin"')
  })

  it('stops on a revoke a wildcard the role holds would undo', () => {
    expect(errorsOf({ grant: { user: ['events:*'] }, revoke: { user: ['events:manage'] } }))
      .toContain('revoke.user takes away "events:manage", but "user" still holds it through "events:*"')
    expect(errorsOf({ revoke: { admin: ['tickets:read'] } })).toContain('revoke.admin has no effect')
  })

  it('stops on a revoke of a permission the role does not hold', () => {
    expect(errorsOf({ revoke: { user: ['forms:manage'] } })).toContain('revoke.user takes away "forms:manage", which "user" does not hold')
  })

  it('revokes a permission that arrives through two inheritance paths', () => {
    const result = compileRbac({
      scopes,
      config: {
        hierarchy: ['admin', 'lead', 'user'],
        definitions: [{ name: 'crew', permissions: ['forms:manage'], inheritedBy: ['lead'] }, { name: 'host', permissions: ['forms:manage'], inheritedBy: ['lead'] }],
        revoke: { lead: ['forms:manage'] },
      },
    })
    expect(result.errors).toEqual([])
    expect(role(result, 'lead').inherits).toEqual(expect.arrayContaining(['crew', 'host']))
    expect(role(result, 'lead').permissions).not.toContain('forms:manage')
    expect(role(result, 'crew').permissions).toContain('forms:manage')
  })
})

describe('compileRbac: rank without inheritance', () => {
  const result = compileRbac({
    scopes: [...scopes, { name: 'supply:read' }, { name: 'partners:read' }],
    config: {
      hierarchy: ['admin', 'manager', 'member', 'supplier', 'partner', 'user'],
      inherits: { member: ['user'], supplier: ['user'] },
      grant: { supplier: ['supply:read'], partner: ['partners:read'] },
    },
  })

  it('keeps permissions from flowing up where inherits says so', () => {
    expect(result.errors).toEqual([])
    expect(role(result, 'supplier').permissions).toContain('supply:read')
    expect(role(result, 'supplier').permissions).not.toContain('partners:read')
    expect(role(result, 'member').permissions).not.toContain('supply:read')
    expect(role(result, 'member').permissions).toContain('tickets:read')
  })

  it('keeps the rank: a manager may still assign supplier and partner', () => {
    expect(result.table.roles.map(candidate => candidate.name)).toEqual(['admin', 'manager', 'member', 'supplier', 'partner', 'user'])
    expect(canAssignRole(result.table, 'manager', 'partner')).toBe(true)
    expect(canAssignRole(result.table, 'member', 'supplier')).toBe(true)
    expect(canAssignRole(result.table, 'supplier', 'member')).toBe(false)
  })

  it('stops on an unknown role in inherits', () => {
    expect(compileRbac({ scopes, config: { inherits: { ghost: ['user'] } } }).errors.join()).toContain('unknown role "ghost"')
  })
})

describe('roleOf and canAssignRole', () => {
  const { table } = compileRbac({ scopes, config: { hierarchy: ['admin', 'manager', 'crew', 'user'] } })

  it('falls back to the default role for an unknown stored role, never to everything', () => {
    expect(roleOf(table, 'retired').name).toBe('user')
    expect(roleOf(table, null).name).toBe('user')
    expect(roleOf(table, 'crew').name).toBe('crew')
  })

  it('lets an actor assign only roles below their own; admins may manage admins', () => {
    expect(canAssignRole(table, 'manager', 'crew')).toBe(true)
    expect(canAssignRole(table, 'manager', 'manager')).toBe(false)
    expect(canAssignRole(table, 'manager', 'admin')).toBe(false)
    expect(canAssignRole(table, 'admin', 'admin')).toBe(true)
    expect(canAssignRole(table, 'user', 'user')).toBe(false)
  })
})
