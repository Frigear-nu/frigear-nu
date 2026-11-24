import { beforeEach, describe, expect, it, vi } from 'vitest'

// The polling limit of the browser handoff: counted per client and attempt, on with the other limits (NuxtHub KV).
const store = new Map<string, number>()
vi.mock('#auth/rate-limit-kv', () => ({
  kv: {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: number) => void store.set(key, value),
  },
}))

let rateLimit: Record<string, unknown> = {}
let clientIp = '127.0.0.1'
const headers = new Map<string, unknown>()
vi.stubGlobal('useRuntimeConfig', () => ({ authentication: { rateLimit } }))
vi.stubGlobal('getRequestHeader', () => undefined)
vi.stubGlobal('getRequestIP', () => clientIp)
vi.stubGlobal('setResponseHeader', (_event: unknown, name: string, value: unknown) => void headers.set(name, value))

const { enforceFrigearHandoffPollLimit, FRIGEAR_HANDOFF_POLL_LIMIT } = await import('../../src/runtime/server/utils/rate-limit')
const event = {} as never

async function poll(id: string, times: number) {
  for (let count = 0; count < times; count++) await enforceFrigearHandoffPollLimit(event, id)
}

beforeEach(() => {
  store.clear()
  headers.clear()
  clientIp = '127.0.0.1'
  rateLimit = { enabled: true, windowSeconds: 900, login: 10, loginIp: 100, requests: 30, ipHeader: '', xForwardedFor: false }
})

describe('enforceFrigearHandoffPollLimit', () => {
  it('lets a window poll every second for the whole attempt', () => {
    expect(FRIGEAR_HANDOFF_POLL_LIMIT).toBeGreaterThanOrEqual(600)
  })

  it('answers 429 rate_limited with retry-after past the limit, per attempt and client', async () => {
    await poll('afh_one', FRIGEAR_HANDOFF_POLL_LIMIT)
    await expect(enforceFrigearHandoffPollLimit(event, 'afh_one')).rejects.toMatchObject({ statusCode: 429, data: { code: 'rate_limited' } })
    expect(Number(headers.get('retry-after'))).toBeGreaterThan(0)

    // Another attempt, or another client, counts on its own.
    await expect(enforceFrigearHandoffPollLimit(event, 'afh_two')).resolves.toBeUndefined()
    clientIp = '127.0.0.2'
    await expect(enforceFrigearHandoffPollLimit(event, 'afh_one')).resolves.toBeUndefined()
  })

  it('does not share the counter of starting attempts (`rateLimit.requests`)', async () => {
    rateLimit.requests = 0
    await poll('afh_one', 31)
    expect([...store.values()]).toEqual([31])
  })

  it('counts nothing with the limits off', async () => {
    rateLimit.enabled = false
    await poll('afh_one', FRIGEAR_HANDOFF_POLL_LIMIT + 1)
    expect(store.size).toBe(0)
  })
})
