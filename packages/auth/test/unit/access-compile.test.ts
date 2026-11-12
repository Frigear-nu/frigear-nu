import { describe, expect, it } from 'vitest'
import { compileAccess, routeRulePermissions, sharedPolicyImportErrors } from '../../src/runtime/utils/access-compile'

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
})

describe('sharedPolicyImportErrors', () => {
  it('refuses server imports in shared policy files', () => {
    expect(sharedPolicyImportErrors('p.ts', `import { defineSharedPolicy } from '@frigear-nu/auth/policies'`)).toEqual([])
    expect(sharedPolicyImportErrors('p.ts', `import { db } from '@nuxthub/db'\nimport { useState } from '#imports'`)).toHaveLength(2)
  })
})
