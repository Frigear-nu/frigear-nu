import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import type { CompiledRole } from '../../src/runtime/utils/permissions'

// `primeAssignedRoles` against a stubbed role provider (`#auth/roles`): one bulk load per request, then the per-user
// role resolution reads from it instead of asking the provider again.
const role = (name: string): CompiledRole => ({
  name,
  label: name,
  grant: [],
  inherit: [],
  inherited: [],
  permissions: [],
  requirements: {},
  auto: false,
  default: false,
  assignable: true,
  provenance: {},
})
const provider = {
  getAssignedRoles: vi.fn(async (_event: unknown, userId: number) => userId === 1 ? ['admin'] : []),
  setRoles: vi.fn(),
  assignedRolesOf: vi.fn(async (ids: number[]) => new Map(ids.filter(id => id !== 3).map(id => [id, id === 1 ? ['admin'] : ['member']]))),
}
vi.mock('#auth/roles', () => ({
  hasProvider: true,
  provider,
  requirements: {},
  table: { roles: { admin: role('admin'), member: role('member') }, defaultRoles: [], autoRoles: [] },
}))
vi.mock('#auth/permissions', () => ({ registry: new Map(), namedScopes: {} }))
vi.mock('#auth/policies', () => ({ policies: [] }))
vi.mock('../../src/runtime/server/utils/auth', () => ({ getAuth: vi.fn() }))
vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: async () => {} } }))

const { getEffectiveRoles, primeAssignedRoles } = await import('../../src/runtime/server/utils/access')

const newEvent = () => ({ context: {} }) as H3Event

beforeEach(() => {
  provider.getAssignedRoles.mockClear()
  provider.assignedRolesOf.mockClear()
})

describe('primeAssignedRoles', () => {
  it('loads every user once, in one call, and role resolution reads from it', async () => {
    const event = newEvent()
    await primeAssignedRoles(event, [1, 2, 2, 3])
    expect(provider.assignedRolesOf).toHaveBeenCalledTimes(1)
    expect(provider.assignedRolesOf).toHaveBeenCalledWith([1, 2, 3])
    expect(await getEffectiveRoles(event, { id: 1 })).toEqual(['admin'])
    expect(await getEffectiveRoles(event, { id: 2 })).toEqual(['member'])
    // A user the provider returned nothing for holds no assigned roles, without a second query.
    expect(await getEffectiveRoles(event, { id: 3 })).toEqual([])
    expect(provider.getAssignedRoles).not.toHaveBeenCalled()
  })

  it('skips users already loaded or resolved in the request', async () => {
    const event = newEvent()
    await primeAssignedRoles(event, [1])
    await getEffectiveRoles(event, { id: 4 })
    await primeAssignedRoles(event, [1, 2, 4])
    expect(provider.assignedRolesOf).toHaveBeenLastCalledWith([2])
    await primeAssignedRoles(event, [1, 2])
    expect(provider.assignedRolesOf).toHaveBeenCalledTimes(2)
  })

  it('does nothing without an event', async () => {
    await primeAssignedRoles(undefined, [1, 2])
    expect(provider.assignedRolesOf).not.toHaveBeenCalled()
  })

  it('falls back to the per-user path when the bulk load fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    provider.assignedRolesOf.mockRejectedValueOnce(new Error('db down'))
    const event = newEvent()
    await primeAssignedRoles(event, [1, 2])
    expect(error).toHaveBeenCalledTimes(1)
    expect(await getEffectiveRoles(event, { id: 1 })).toEqual(['admin'])
    expect(provider.getAssignedRoles).toHaveBeenCalledWith(event, 1)
    error.mockRestore()
  })
})
