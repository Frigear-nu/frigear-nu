import { describe, it, expect } from 'vitest'
import { defineSharedPolicy } from '@frigear-nu/auth/policies'
import type { AccessDto } from '@frigear-nu/auth/policies'
import { accessAllows, collectSharedPolicies } from '../../src/runtime/utils/access'

const access: AccessDto = { kind: 'session', scopes: [], permissions: ['posts:read', 'posts:update'], roles: ['editor'] }

describe('client can()', () => {
  it('is the exact permissions list, never expanding wildcards', () => {
    expect(accessAllows(access, 'posts:read')).toBe(true)
    expect(accessAllows(access, 'posts:delete')).toBe(false)
    expect(accessAllows({ ...access, permissions: ['*'] }, 'posts:read')).toBe(false)
    expect(accessAllows(null, 'posts:read')).toBe(false)
  })

  it('runs the shared policies of the permission, which can only deny', () => {
    const own = defineSharedPolicy<{ ownerId: number }, { id: number }>('posts:update', ({ user, record }) => record!.ownerId === user?.id ? undefined : false)
    const other = defineSharedPolicy('posts:read', () => false)
    const policies = [own, other] as never
    expect(accessAllows(access, 'posts:update', { record: { ownerId: 1 }, user: { id: 1 }, policies })).toBe(true)
    expect(accessAllows(access, 'posts:update', { record: { ownerId: 2 }, user: { id: 1 }, policies })).toBe(false)
    // Without a record, a policy only runs with `withoutRecord`.
    expect(accessAllows(access, 'posts:update', { user: { id: 1 }, policies })).toBe(true)
    // A policy never grants what access lacks.
    const yes = defineSharedPolicy('posts:delete', () => true)
    expect(accessAllows(access, 'posts:delete', { record: {}, policies: [yes] as never })).toBe(false)
  })

  it('denies when a policy throws or is async', () => {
    const throws = defineSharedPolicy('posts:read', () => {
      throw new Error('boom')
    }, { withoutRecord: true })
    expect(accessAllows(access, 'posts:read', { policies: [throws] as never })).toBe(false)
    const async = defineSharedPolicy('posts:read', (() => Promise.resolve(true)) as never, { withoutRecord: true })
    expect(accessAllows(access, 'posts:read', { policies: [async] as never })).toBe(false)
  })

  it('collects shared policies from a module\'s exports', () => {
    const one = defineSharedPolicy('posts:read', () => undefined)
    const two = defineSharedPolicy('posts:update', () => undefined)
    expect(collectSharedPolicies({ one, list: [two], other: { permission: 'x:y' }, value: 1 })).toEqual([one, two])
  })
})
