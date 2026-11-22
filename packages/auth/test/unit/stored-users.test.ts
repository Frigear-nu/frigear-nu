import { describe, expect, it, vi } from 'vitest'
import { findStoredUsers } from '../../src/runtime/utils/stored-users'
import type { AuthStoredUser } from '../../src/runtime/types'

const user = (id: number): AuthStoredUser => ({ id, name: `User ${id}`, email: `u${id}@example.com` })

describe('findStoredUsers', () => {
  it('asks a store with findByIds once, with every id once', async () => {
    const findById = vi.fn(async (id: string | number) => user(Number(id)))
    const findByIds = vi.fn(async (ids: Array<string | number>) => ids.filter(id => Number(id) !== 3).map(id => user(Number(id))))
    const found = await findStoredUsers({ findById, findByIds }, [1, '2', 2, 3, 'abc', 0, -1, 1.5])
    expect(findByIds).toHaveBeenCalledTimes(1)
    expect(findByIds).toHaveBeenCalledWith([1, 2, 3])
    expect(findById).not.toHaveBeenCalled()
    expect(found.map(row => row.id)).toEqual([1, 2])
  })

  it('falls back to findById per id for a store without findByIds, leaving unknown ids out', async () => {
    const findById = vi.fn(async (id: string | number) => Number(id) === 2 ? null : user(Number(id)))
    expect((await findStoredUsers({ findById }, [1, 2, 3])).map(row => row.id)).toEqual([1, 3])
    expect(findById).toHaveBeenCalledTimes(3)
  })

  it('reads nothing for no ids', async () => {
    const findByIds = vi.fn(async () => [])
    expect(await findStoredUsers({ findById: async () => null, findByIds }, [])).toEqual([])
    expect(findByIds).not.toHaveBeenCalled()
  })
})
