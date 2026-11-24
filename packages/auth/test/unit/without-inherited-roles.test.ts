import { describe, expect, it, vi } from 'vitest'
import type { CompiledRole } from '../../src/runtime/utils/permissions'

// `withoutInheritedRoles` against a stubbed role table: admin > manager > crew, and an unrelated `partner`.
const role = (name: string, inherited: string[]): CompiledRole => ({
  name,
  label: name,
  grant: [],
  inherit: inherited.slice(0, 1),
  inherited,
  permissions: [],
  requirements: {},
  auto: false,
  default: false,
  assignable: true,
  provenance: {},
})
vi.mock('#auth/roles', () => ({
  hasProvider: true,
  provider: {},
  requirements: {},
  table: {
    roles: {
      admin: role('admin', ['crew', 'manager']),
      manager: role('manager', ['crew']),
      crew: role('crew', []),
      partner: role('partner', []),
    },
    defaultRoles: [],
    autoRoles: [],
  },
}))
vi.mock('#auth/permissions', () => ({ registry: new Map(), namedScopes: {} }))
vi.mock('#auth/policies', () => ({ policies: [] }))
vi.mock('../../src/runtime/server/utils/auth', () => ({ getAuth: vi.fn() }))

const { withoutInheritedRoles } = await import('../../src/runtime/server/utils/access')

describe('withoutInheritedRoles', () => {
  it('drops roles another of them inherits, keeping order', () => {
    expect(withoutInheritedRoles(['crew', 'admin', 'manager', 'partner'])).toEqual(['admin', 'partner'])
    expect(withoutInheritedRoles(['manager', 'crew'])).toEqual(['manager'])
  })

  it('keeps unknown roles and drops duplicates', () => {
    expect(withoutInheritedRoles(['ghost', 'crew', 'crew'])).toEqual(['ghost', 'crew'])
    expect(withoutInheritedRoles([])).toEqual([])
  })
})
