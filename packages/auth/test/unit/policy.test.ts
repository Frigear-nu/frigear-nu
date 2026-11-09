import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const requireAuth = vi.fn()
vi.mock('../../src/runtime/server/utils/auth', () => ({ requireAuth }))

type Ctx = { userId: number, allowed: boolean } & Record<string, unknown>
let decide: (ctx: Ctx) => void = () => {}
const seen: Array<{ hook: string, ctx: Ctx }> = []
vi.stubGlobal('useNitroApp', () => ({
  hooks: {
    callHook: async (hook: string, ctx: Ctx) => {
      seen.push({ hook, ctx: { ...ctx } })
      decide(ctx)
    },
  },
}))

// `null`: no access control installed (the default before roles).
let permissions: Record<number, string[] | null> = {}
vi.stubGlobal('setResponseHeader', () => {})
vi.stubGlobal('getAuthUserPermissions', async (_event: H3Event, userId: number) => permissions[userId] ?? null)

const { definePolicyGate, defineStaffGuard } = await import('../../src/runtime/server/utils/policy')
const event = {} as H3Event

beforeEach(() => {
  permissions = {}
  seen.length = 0
  decide = () => {}
  requireAuth.mockReset()
})

describe('definePolicyGate', () => {
  it('is denied by default and merges extra context into the hook context', async () => {
    const gate = definePolicyGate<{ action: string, target?: { id: number } }>('users:admin:authorize')
    expect(await gate.isAllowed(event, 1, { action: 'update', target: { id: 2 } })).toBe(false)
    expect(seen[0]).toMatchObject({ hook: 'users:admin:authorize', ctx: { event, userId: 1, allowed: false, action: 'update', target: { id: 2 } } })
  })

  it('extra context cannot pre-allow or change the user', async () => {
    const gate = definePolicyGate<Record<string, unknown>>('x:authorize')
    expect(await gate.isAllowed(event, 1, { allowed: true, userId: 99 })).toBe(false)
    expect(seen[0]!.ctx).toMatchObject({ userId: 1, allowed: false })
  })

  it('assert throws 403 forbidden with the message', async () => {
    const gate = definePolicyGate('x:authorize')
    await expect(gate.assert(event, 1, 'No events for you.')).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'No events for you.',
      data: { code: 'forbidden' },
    })
    decide = (ctx) => {
      ctx.allowed = true
    }
    await expect(gate.assert(event, 1)).resolves.toBeUndefined()
  })
})

describe('defineStaffGuard', () => {
  const guard = defineStaffGuard({ hook: 'events:authorize', scope: 'events:admin', message: 'You cannot manage events.' })

  it('requires the scope, then asks the host', async () => {
    const principal = { kind: 'session', user: { id: 7 }, scopes: ['*'] }
    requireAuth.mockResolvedValue(principal)
    decide = (ctx) => {
      ctx.allowed = ctx.userId === 7
    }
    expect(await guard.require(event)).toEqual({ userId: 7, principal })
    expect(requireAuth).toHaveBeenCalledWith(event, { sessionOnly: undefined })

    await guard.require(event, { sessionOnly: true })
    expect(requireAuth).toHaveBeenLastCalledWith(event, { sessionOnly: true })
  })

  it('throws the guard message when the host denies', async () => {
    requireAuth.mockResolvedValue({ kind: 'session', user: { id: 8 }, scopes: ['*'] })
    await expect(guard.require(event)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'You cannot manage events.', data: { code: 'forbidden' } })
  })

  it('does not ask the host when authentication fails', async () => {
    requireAuth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(guard.require(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(seen).toHaveLength(0)
  })

  it('can() answers without throwing', async () => {
    expect(await guard.can(event, 1)).toBe(false)
    decide = (ctx) => {
      ctx.allowed = true
    }
    expect(await guard.can(event, 1)).toBe(true)
  })
})

describe('defineStaffGuard scope checks', () => {
  const guard = defineStaffGuard({ hook: 'forms:authorize', scope: 'forms:manage' })

  it('lets a host condition admit a session whose role lacks the permission (an allowlist)', async () => {
    permissions = { 5: ['forms:submit'] }
    requireAuth.mockResolvedValue({ kind: 'session', user: { id: 5 }, scopes: ['forms:submit'] })
    decide = (ctx) => {
      ctx.allowed ||= ctx.userId === 5
    }
    await expect(guard.require(event)).resolves.toMatchObject({ userId: 5 })
  })

  it('refuses a bearer credential without the scope before asking the gate', async () => {
    requireAuth.mockResolvedValue({ kind: 'user-token', user: { id: 5 }, scopes: ['tickets:read'] })
    decide = (ctx) => {
      ctx.allowed = true
    }
    await expect(guard.require(event)).rejects.toMatchObject({ statusCode: 403, data: { code: 'insufficient_scope' } })
    expect(seen).toHaveLength(0)
  })
})

describe('role-based default (access control on)', () => {
  const guard = defineStaffGuard({ hook: 'events:authorize', scope: 'events:manage' })

  it('allows a user whose role holds the permission, with no host listener', async () => {
    permissions = { 1: ['events:*'], 2: ['tickets:read'] }
    expect(await guard.can(event, 1)).toBe(true)
    expect(await guard.can(event, 2)).toBe(false)
    expect(seen[0]!.ctx).toMatchObject({ userId: 1, allowed: true })
  })

  it('lets a host listener add a condition either way', async () => {
    permissions = { 1: ['events:manage'], 2: [] }
    decide = (ctx) => {
      if (ctx.userId === 1) ctx.allowed = false
      if (ctx.userId === 2) ctx.allowed = true
    }
    expect(await guard.can(event, 1)).toBe(false)
    expect(await guard.can(event, 2)).toBe(true)
  })

  it('never lets a wildcard cover a :pii permission', async () => {
    permissions = { 1: ['*', 'events:*'] }
    const pii = definePolicyGate('events:authorize', { permission: 'events:pii' })
    expect(await pii.isAllowed(event, 1)).toBe(false)
    permissions = { 1: ['events:pii'] }
    expect(await pii.isAllowed(event, 1)).toBe(true)
  })

  it('a gate without a permission stays denied by default', async () => {
    permissions = { 1: ['*'] }
    expect(await definePolicyGate('x:authorize').isAllowed(event, 1)).toBe(false)
  })
})
