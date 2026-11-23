import { describe, expect, it, vi } from 'vitest'
import { ROLE_HOLDER_LIMIT, collectRoleHolders, rolesGranting } from '../../src/runtime/utils/permissions'
import { rolesGranting as fromAccess } from '../../src/runtime/access'

const table = {
  admin: { inherit: ['lead'] },
  lead: { inherit: ['member'] },
  member: {},
  guest: {},
}

describe('rolesGranting', () => {
  it('adds every role inheriting a wanted one, directly or not', () => {
    expect(rolesGranting(table, ['member'])).toEqual(['admin', 'lead', 'member'])
    expect(rolesGranting(table, ['lead'])).toEqual(['admin', 'lead'])
    expect(rolesGranting(table, ['guest'])).toEqual(['guest'])
    // An unknown role is kept as asked: the provider simply has no rows for it.
    expect(rolesGranting(table, ['ghost'])).toEqual(['ghost'])
  })

  it('is framework free (`@frigear-nu/auth/access`)', () => {
    expect(fromAccess).toBe(rolesGranting)
  })
})

describe('collectRoleHolders', () => {
  it('returns nobody without a provider that lists holders (fail closed)', async () => {
    const holds = vi.fn(async () => true)
    expect(await collectRoleHolders({ roles: ['member'], table, holds })).toEqual([])
    expect(holds).not.toHaveBeenCalled()
  })

  it('asks the provider for the roles granting the wanted ones, then keeps the confirmed holders', async () => {
    const holders = vi.fn(async () => [1, 2, '3', 2, 0, -1, Number.NaN])
    const result = await collectRoleHolders({ roles: ['member'], table, holders, holds: async id => id !== 2 })
    expect(holders).toHaveBeenCalledWith(['admin', 'lead', 'member'], { limit: ROLE_HOLDER_LIMIT })
    expect(result).toEqual([1, 3])
  })

  it('primes every candidate in one call before checking them one by one', async () => {
    const calls: string[] = []
    const prime = vi.fn(async (ids: number[]) => {
      calls.push(`prime:${ids.join(',')}`)
    })
    const holds = vi.fn(async (id: number) => {
      calls.push(`holds:${id}`)
      return true
    })
    expect(await collectRoleHolders({ roles: ['member'], table, holders: async () => [1, 2, 2, 3], prime, holds })).toEqual([1, 2, 3])
    expect(prime).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['prime:1,2,3', 'holds:1', 'holds:2', 'holds:3'])
    // Nobody to check: nothing to load.
    prime.mockClear()
    await collectRoleHolders({ roles: ['member'], table, holders: async () => [], prime, holds })
    expect(prime).not.toHaveBeenCalled()
  })

  it('caps the limit at ROLE_HOLDER_LIMIT and applies a lower one', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const holders = vi.fn(async (_roles: string[], { limit }: { limit: number }) => Array.from({ length: limit + 5 }, (_, i) => i + 1))
    expect(await collectRoleHolders({ roles: ['guest'], table, holders, holds: async () => true, limit: 3 })).toEqual([1, 2, 3])
    await collectRoleHolders({ roles: ['guest'], table, holders, holds: async () => true, limit: 50_000 })
    expect(holders).toHaveBeenLastCalledWith(['guest'], { limit: ROLE_HOLDER_LIMIT })
    warn.mockRestore()
  })

  it('warns when the provider returns as many candidates as the limit, since the list may be cut', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const holders = async (_roles: string[], { limit }: { limit: number }) => Array.from({ length: limit }, (_, i) => i + 1)
    expect(await collectRoleHolders({ roles: ['guest'], table, holders, holds: async () => true, limit: 3 })).toEqual([1, 2, 3])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toMatch(/may be incomplete/)
    // Fewer candidates than the limit: the list is whole, nothing to warn about.
    warn.mockClear()
    await collectRoleHolders({ roles: ['guest'], table, holders: async () => [1, 2], holds: async () => true, limit: 3 })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('lists nobody for no roles or a zero limit', async () => {
    const holders = vi.fn(async () => [1])
    expect(await collectRoleHolders({ roles: [], table, holders, holds: async () => true })).toEqual([])
    expect(await collectRoleHolders({ roles: ['member'], table, holders, holds: async () => true, limit: 0 })).toEqual([])
    expect(holders).not.toHaveBeenCalled()
  })
})
