import { describe, expect, it } from 'vitest'
import { compileAccess, routeRulePermissions, sharedPolicyImportErrors } from '../../src/runtime/utils/access-compile'
import { convertLegacyAccess } from '../../src/runtime/utils/legacy-build'

describe('compileAccess', () => {
  const permissions = [
    { name: 'events:read', implicit: true },
    { name: 'events:update' },
    { name: 'admin:access' },
  ]

  it('compiles registry, roles and named scopes, treating `override` as a host role', () => {
    const result = compileAccess({
      permissions,
      roles: [
        { name: 'admin', grant: ['*'], override: true },
        { name: 'admin', label: 'Module admin', grant: ['events:update'], from: 'events' },
      ],
      defaultRoles: [],
      namedScopes: [{ name: 'events', permissions: ['events:read'] }],
    })
    expect(result.errors).toEqual([])
    expect(result.roles.roles.admin!.provenance['events:update']).toEqual([{ via: 'module', from: 'events' }, { via: 'host' }])
    expect(result.namedScopes.events!.permissions).toEqual(['events:read'])
  })

  it('reports unknown route rule permissions and scopes named like permissions', () => {
    const result = compileAccess({
      permissions,
      namedScopes: [{ name: 'events' }],
      routePermissions: routeRulePermissions({ '/api/admin/**': { permission: 'admin:nope' }, '/api/x': { authenticated: true } }),
    })
    expect(result.errors).toEqual([expect.stringMatching(/"\/api\/admin\/\*\*" requires "admin:nope"/)])
  })

  it('keeps legacy registrations lenient', () => {
    const legacy = convertLegacyAccess(
      [
        { name: 'events:manage', aggregateTo: ['eventmanager'] },
        { name: 'tickets:read', aggregateTo: ['user'] },
        { name: 'users:read' },
        { name: 'users:manage', sessionOnly: true },
      ],
      [{ name: 'eventmanager', inherits: ['user'], inheritedBy: ['admin'], permissions: ['ghost:read'] }],
    )
    expect(legacy.permissions).toEqual([
      { name: 'events:manage', description: undefined, grantTo: ['eventmanager'] },
      { name: 'tickets:read', description: undefined, implicit: true },
      { name: 'users:read', description: undefined, grantTo: ['admin'] },
      { name: 'users:manage', description: undefined, sessionOnly: true, grantTo: ['admin'] },
    ])
    // No `user` role, no `ghost:read`: dropped with a note. `admin` exists, so it inherits the legacy role.
    const result = compileAccess({ permissions: legacy.permissions, roles: [...legacy.roles, { name: 'admin', grant: [], override: true }], extensions: legacy.extensions })
    expect(result.errors).toEqual([])
    expect(result.roles.roles.eventmanager!.permissions).toEqual(['events:manage'])
    expect(result.roles.roles.admin!.inherited).toEqual(['eventmanager'])
    expect(result.roles.roles.admin!.permissions).toEqual(['events:manage', 'users:manage', 'users:read'])
    expect(result.warnings.join('\n')).toMatch(/"user", "ghost:read"/)
  })
})

describe('sharedPolicyImportErrors', () => {
  it('refuses server imports in shared policy files', () => {
    expect(sharedPolicyImportErrors('p.ts', `import { defineSharedPolicy } from '@frigear-nu/auth/policies'`)).toEqual([])
    expect(sharedPolicyImportErrors('p.ts', `import { db } from '@nuxthub/db'\nimport { useState } from '#imports'`)).toHaveLength(2)
  })
})
