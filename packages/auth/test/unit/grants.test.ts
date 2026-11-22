import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { H3Event } from 'h3'
import {
  checkGrantList,
  chunkGrantParams,
  createGrantRegistry,
  defineGrantKind,
  GRANT_PARAM_CHUNK,
  hasPublicGrant,
  listGrantMembers,
  matchGrantList,
  publicGrantSchema,
  readGrants,
} from '../../src/runtime/grants'
import { extendGrants, registeredGrantKinds } from '../../src/runtime/utils/grants-build'
import publicKind from '../../src/runtime/server/grants/public'
import signedInKind from '../../src/runtime/server/grants/signed-in'

const event = {} as H3Event
const roles: Record<number, string[]> = { 1: ['admin'], 2: ['member'] }
// A stand-in for the `role` kind of `@frigear-nu/authorization`, which auth does not ship.
const roleGrantSchema = z.strictObject({ kind: z.literal('role'), role: z.string().trim().min(1).max(64) })

const registry = createGrantRegistry([
  publicKind,
  signedInKind,
  defineGrantKind('role', {
    schema: roleGrantSchema,
    matches: ({ user, grant }) => !!user && (roles[Number(user.id)] ?? []).includes(grant.role),
    members: ({ grants }) => Object.entries(roles).filter(([, held]) => grants.some(grant => held.includes(grant.role))).map(([id]) => id),
  }),
  defineGrantKind('broken', {
    schema: z.strictObject({ kind: z.literal('broken') }),
    matches: () => {
      throw new Error('boom')
    },
    members: () => {
      throw new Error('boom')
    },
  }),
])

describe('readGrants', () => {
  it('reads anything but an array as the empty list, and drops entries without a kind', () => {
    expect(readGrants(null)).toEqual([])
    expect(readGrants({ public: true })).toEqual([])
    expect(readGrants([{ kind: 'role', role: 'admin' }, 'x', { role: 'admin' }, null])).toEqual([{ kind: 'role', role: 'admin' }])
  })

  it('finds a public grant', () => {
    expect(hasPublicGrant([{ kind: 'role', role: 'admin' }, { kind: 'public' }])).toBe(true)
    expect(hasPublicGrant([{ kind: 'role', role: 'admin' }])).toBe(false)
    expect(hasPublicGrant(undefined)).toBe(false)
  })

  it('does not count an invalid public grant, with or without a registry (fail closed)', () => {
    const invalid = [{ kind: 'public', x: 1 }]
    expect(hasPublicGrant(invalid)).toBe(false)
    expect(hasPublicGrant(invalid, registry)).toBe(false)
    expect(hasPublicGrant([{ kind: 'public' }], registry)).toBe(true)
    // A registry without the `public` kind knows no public grant.
    expect(hasPublicGrant([{ kind: 'public' }], createGrantRegistry([signedInKind]))).toBe(false)
  })
})

describe('matchGrantList', () => {
  const user = (id: number) => ({ id })

  it('admits on any one grant', async () => {
    const grants = [{ kind: 'role', role: 'member' }, { kind: 'role', role: 'admin' }]
    expect(await matchGrantList(registry, event, user(1), grants)).toBe(true)
    expect(await matchGrantList(registry, event, user(2), grants)).toBe(true)
    expect(await matchGrantList(registry, event, user(3), grants)).toBe(false)
  })

  it('admits nobody with the empty list, signed in or not', async () => {
    expect(await matchGrantList(registry, event, user(1), [])).toBe(false)
    expect(await matchGrantList(registry, event, null, [])).toBe(false)
    expect(await matchGrantList(registry, event, user(1), null)).toBe(false)
  })

  it('admits anonymous callers only through a public grant', async () => {
    expect(await matchGrantList(registry, event, null, [{ kind: 'role', role: 'admin' }])).toBe(false)
    expect(await matchGrantList(registry, event, null, [{ kind: 'public' }])).toBe(true)
  })

  it('admits every signed-in user through a signed-in grant, and no anonymous caller', async () => {
    expect(await matchGrantList(registry, event, user(3), [{ kind: 'signed-in' }])).toBe(true)
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'signed-in' }])).toBe(true)
    expect(await matchGrantList(registry, event, null, [{ kind: 'signed-in' }])).toBe(false)
    expect(await matchGrantList(registry, event, user(3), [{ kind: 'signed-in', role: 'admin' }])).toBe(false)
  })

  it('fails closed on an unknown kind, an invalid grant and a kind that throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'galaxy' }])).toBe(false)
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'role', roles: ['admin'] }])).toBe(false)
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'role', role: 'admin', extra: true }])).toBe(false)
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'broken' }])).toBe(false)
    expect(await matchGrantList(registry, event, user(1), [{ kind: 'broken' }, { kind: 'role', role: 'admin' }])).toBe(true)
    spy.mockRestore()
  })
})

describe('listGrantMembers', () => {
  it('unions the members of every kind, as text', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await listGrantMembers(registry, event, [{ kind: 'role', role: 'admin' }, { kind: 'role', role: 'member' }, { kind: 'broken' }, { kind: 'public' }, { kind: 'signed-in' }, { kind: 'galaxy' }]))
      .toEqual(['1', '2'])
    expect(await listGrantMembers(registry, event, [])).toEqual([])
    spy.mockRestore()
  })
})

describe('checkGrantList', () => {
  it('reports unknown kinds and invalid grants by index', () => {
    expect(checkGrantList(registry, [{ kind: 'public' }, { kind: 'galaxy' }, { kind: 'role' }])).toEqual([
      { index: 1, message: 'Unknown grant kind "galaxy".' },
      { index: 2, message: 'This "role" grant is not valid.' },
    ])
  })
})

describe('defineGrantKind and chunkGrantParams', () => {
  it('refuses a kind name that is not lower case', () => {
    expect(() => defineGrantKind('Team', { schema: publicGrantSchema, matches: () => true, members: () => [] })).toThrow()
  })

  it('cuts lists under the bound parameter limit', () => {
    const ids = Array.from({ length: 200 }, (_, index) => index)
    const chunks = chunkGrantParams(ids)
    expect(chunks.map(chunk => chunk.length)).toEqual([GRANT_PARAM_CHUNK, GRANT_PARAM_CHUNK, 200 - 2 * GRANT_PARAM_CHUNK])
    expect(chunks.flat()).toEqual(ids)
  })
})

describe('extendGrants', () => {
  it('collects kinds, replaces one registered again and refuses a bad name', () => {
    const nuxt = { options: {} } as Parameters<typeof extendGrants>[0]
    extendGrants(nuxt, [{ kind: 'public', label: 'Everyone', server: '/public' }, { kind: 'team', label: 'Team', server: '/team' }])
    extendGrants(nuxt, { kind: 'team', label: 'Teams', server: '/team-2' })
    expect(registeredGrantKinds(nuxt).map(kind => [kind.kind, kind.server])).toEqual([['public', '/public'], ['team', '/team-2']])
    expect(() => extendGrants(nuxt, { kind: 'Team', label: 'Team', server: '/x' })).toThrow()
  })
})
