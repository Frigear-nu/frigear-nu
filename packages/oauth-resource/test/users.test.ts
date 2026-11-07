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
  // `66` is a user whose address the issuer has not verified.
  return { sub, email: `person${sub}@frigear.test`, name: `Person ${sub}`, email_verified: sub !== '66' }
})
vi.stubGlobal('loadAuthUser', async (id: number) => rows.find(row => row.id === Number(id)) ?? null)
vi.stubGlobal('useAuthUserStore', () => ({
  findById: async (id: number) => rows.find(row => row.id === id) ?? null,
  findByEmail: async (email: string) => rows.find(row => row.email === email) ?? null,
}))
vi.stubGlobal('syncFrigearUser', async (profile: { id?: number, email: string, name?: string, emailVerified?: boolean }) => {
  const email = profile.email.toLowerCase()
  const existing = rows.find(row => row.email === email)
  // Like the real one: an existing user is never matched by an unverified email.
  if (existing && profile.emailVerified !== true) throw Object.assign(new Error('unverified'), { statusCode: 403 })
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

describe('resolveOAuthResourceUser with forceId and a local row holding the id', () => {
  const withForceId = async (run: () => Promise<void>) => {
    config.forceId = true
    try {
      await run()
    }
    finally {
      config.forceId = false
    }
  }

  it('does not return a local row with id == sub and another email', () => withForceId(async () => {
    rows.push({ id: 31, email: 'someone-else@frigear.test', name: 'Someone else' })
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {})
    expect(await resolveOAuthResourceUser('token-31', payload('31'))).toBeNull()
    // Not remembered as a binding either.
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {})
    expect(await resolveOAuthResourceUser('token-31', payload('31'))).toBeNull()
  }))

  it('returns the row when the email matches (case-insensitive) and remembers the binding', () => withForceId(async () => {
    rows.push({ id: 32, email: 'Person32@Frigear.test', name: 'Same person' })
    expect(await resolveOAuthResourceUser('token-32', payload('32'))).toMatchObject({ id: 32 })
    const calls = userinfoCalls
    expect(await resolveOAuthResourceUser('token-32', payload('32'))).toMatchObject({ id: 32 })
    expect(userinfoCalls).toBe(calls)
  }))
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

  it('does not resolve an existing user from an unverified email, also not through the race fallback', async () => {
    rows.push({ id: 2, email: 'person66@frigear.test', name: 'Victim' })
    vi.spyOn(console, 'warn').mockImplementationOnce(() => {})
    expect(await resolveOAuthResourceUser('token-66', payload('66'))).toBeNull()
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
