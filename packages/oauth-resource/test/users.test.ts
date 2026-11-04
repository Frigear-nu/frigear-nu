import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OAuthResourceAccessToken } from '../src/types'

// The user resolution without `forceId`: users are matched by the email frigear.nu has for `sub`.
type Row = { id: number, email: string, name: string }
let rows: Row[] = []
let userinfoCalls = 0
const config = { forceId: false }

vi.stubGlobal('useRuntimeConfig', () => ({
  frigear: { forceId: false },
  oauthResource: { issuer: 'https://frigear.example.test', audience: 'frigear-services', jwksUrl: '', userinfoUrl: '', corsOrigins: '', corsPaths: '', forceId: config.forceId, jwksCacheTtl: 600 },
}))
vi.stubGlobal('$fetch', async (_url: string, options: { headers: { authorization: string } }) => {
  userinfoCalls++
  const sub = options.headers.authorization.replace('Bearer token-', '')
  return { sub, email: `person${sub}@frigear.test`, name: `Person ${sub}` }
})
vi.stubGlobal('loadAuthUser', async (id: number) => rows.find(row => row.id === Number(id)) ?? null)
vi.stubGlobal('useAuthUserStore', () => ({
  findById: async (id: number) => rows.find(row => row.id === id) ?? null,
  findByEmail: async (email: string) => rows.find(row => row.email === email) ?? null,
}))
vi.stubGlobal('syncFrigearUser', async (profile: { id?: number, email: string, name?: string }) => {
  const email = profile.email.toLowerCase()
  const existing = rows.find(row => row.email === email)
  if (existing) return existing
  const row = { id: profile.id ?? rows.length + 1, email, name: profile.name ?? email }
  rows.push(row)
  return row
})

const { resolveOAuthResourceUser } = await import('../src/runtime/server/utils/oauth-resource')
const payload = (sub: string) => ({ sub, iss: 'https://frigear.example.test', aud: 'frigear-services', exp: 0, client_id: 'app' }) as OAuthResourceAccessToken

beforeEach(() => {
  rows = [{ id: 1, email: 'person77@frigear.test', name: 'Existing' }]
  userinfoCalls = 0
})

describe('resolveOAuthResourceUser without forceId', () => {
  it('matches an existing user by email, once, then remembers the frigear.nu id', async () => {
    expect(await resolveOAuthResourceUser('token-77', payload('77'))).toMatchObject({ id: 1, name: 'Existing' })
    expect(await resolveOAuthResourceUser('token-77', payload('77'))).toMatchObject({ id: 1 })
    expect(userinfoCalls).toBe(1)
  })

  it('creates an unknown user with a local id', async () => {
    expect(await resolveOAuthResourceUser('token-5', payload('5'))).toMatchObject({ id: 2, email: 'person5@frigear.test' })
  })

  it('uses sub as the id with forceId', async () => {
    config.forceId = true
    try {
      expect(await resolveOAuthResourceUser('token-900', payload('900'))).toMatchObject({ id: 900 })
      expect(await resolveOAuthResourceUser('token-x', payload('not-a-number'))).toBeNull()
    }
    finally {
      config.forceId = false
    }
  })
})
