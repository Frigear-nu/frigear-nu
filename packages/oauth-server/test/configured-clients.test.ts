import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { importPKCS8 } from 'jose'
import {
  DEFAULT_REFRESH_TOKEN_POLICY,
  configuredClientWarnings,
  isExactOrigin,
  isLongBrowserSession,
  normalizeConfiguredClients,
  oauthClientKind,
  refreshTokenExpiresAt,
  resolveRefreshTokenOptions,
  resolveRefreshTokenPolicy,
} from '../src/runtime/utils'
import { loadOrCreateDevSigningKey } from '../src/dev-key'

const mobile = { id: 'mobile', name: 'Mobile', redirectUris: ['com.example.app:/auth/callback'] }

describe('normalizeConfiguredClients', () => {
  it('turns a native client into a listed public application without a website or CORS origin', () => {
    expect(normalizeConfiguredClients([mobile])).toEqual([{
      id: 'mobile',
      name: 'Mobile',
      clientType: 'public',
      websiteUrl: null,
      isListed: true,
      redirectUris: ['com.example.app:/auth/callback'],
      description: null,
      icon: null,
      allowedRoles: [],
      tags: [],
      wildcardScopes: false,
      corsOrigins: [],
      refreshToken: { idleTtl: null, maxAge: null },
      allowLongBrowserSessions: false,
    }])
  })

  it('accepts nothing, an empty env value and JSON', () => {
    expect(normalizeConfiguredClients(undefined)).toEqual([])
    expect(normalizeConfiguredClients('')).toEqual([])
    expect(normalizeConfiguredClients(JSON.stringify([mobile]))[0]!.id).toBe('mobile')
    expect(() => normalizeConfiguredClients('{not json')).toThrow(/JSON/)
    expect(() => normalizeConfiguredClients({ id: 'x' })).toThrow(/list/)
  })

  it.each(['ab', '-mobile', 'mo bile', 'mobile!', 'x'.repeat(65), '', 'é-app'])('refuses the id %j', (id) => {
    expect(() => normalizeConfiguredClients([{ ...mobile, id }])).toThrow(/id must be/)
  })

  it('refuses the app_ prefix of created applications and duplicate ids', () => {
    expect(() => normalizeConfiguredClients([{ ...mobile, id: 'app_mobile' }])).toThrow(/app_/)
    expect(() => normalizeConfiguredClients([{ ...mobile, id: 'APP_mobile' }])).toThrow(/app_/)
    expect(() => normalizeConfiguredClients([mobile, { ...mobile, id: 'Mobile' }])).toThrow(/used twice/)
    expect(normalizeConfiguredClients([{ ...mobile, id: 'com.example.app' }])[0]!.id).toBe('com.example.app')
  })

  it('only configures public clients and needs a name and a redirect URI', () => {
    expect(() => normalizeConfiguredClients([{ ...mobile, type: 'confidential' }])).toThrow(/public/)
    expect(normalizeConfiguredClients([{ ...mobile, type: 'public' }])[0]!.clientType).toBe('public')
    expect(() => normalizeConfiguredClients([{ ...mobile, name: ' ' }])).toThrow(/name/)
    expect(() => normalizeConfiguredClients([{ ...mobile, redirectUris: [] }])).toThrow(/at least one/)
    expect(() => normalizeConfiguredClients([{ ...mobile, redirectUris: 'com.example.app:/cb' }])).toThrow(/list of strings/)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'file:///etc/passwd',
    'http://app.example.com/cb',
    'com.example.*:/cb',
    'https://*.example.com/cb',
    'com.example.app:/cb#frag',
    'https://user:pass@app.example.com/cb',
    'not a uri',
  ])('refuses the redirect URI %j', (uri) => {
    expect(() => normalizeConfiguredClients([{ ...mobile, redirectUris: [uri] }])).toThrow(/not a valid redirect URI/)
  })

  it('merges devRedirectUris only in development, without duplicates', () => {
    const client = { ...mobile, devRedirectUris: ['http://localhost:3001/auth/callback', 'com.example.app:/auth/callback'] }
    expect(normalizeConfiguredClients([client])[0]!.redirectUris).toEqual(['com.example.app:/auth/callback'])
    const dev = normalizeConfiguredClients([client], { dev: true })[0]!
    expect(dev.redirectUris).toEqual(['com.example.app:/auth/callback', 'http://localhost:3001/auth/callback'])
    // Dev URIs are checked like the others.
    expect(() => normalizeConfiguredClients([{ ...mobile, devRedirectUris: ['javascript:alert(1)'] }], { dev: true })).toThrow(/not a valid/)
  })

  it('derives the website from the first web redirect URI; a native-only client has none', () => {
    const web = normalizeConfiguredClients([{ ...mobile, redirectUris: ['com.example.app:/cb', 'https://app.example.com/auth/callback'] }])[0]!
    expect(web.websiteUrl).toBe('https://app.example.com')
    expect(normalizeConfiguredClients([{ ...mobile, redirectUris: ['capacitor://localhost/auth/callback'] }])[0]!.websiteUrl).toBeNull()
    expect(normalizeConfiguredClients([mobile])[0]!.websiteUrl).toBeNull()
    expect(normalizeConfiguredClients([{ ...mobile, websiteUrl: 'https://www.example.com/' }])[0]!.websiteUrl).toBe('https://www.example.com')
    expect(() => normalizeConfiguredClients([{ ...mobile, websiteUrl: 'https://example.com/app' }])).toThrow(/without a path/)
    expect(() => normalizeConfiguredClients([{ ...mobile, websiteUrl: 'http://example.com' }])).toThrow(/https/)
  })

  it('derives the CORS origins of redirect URIs that have one, unless told otherwise', () => {
    const client = { ...mobile, redirectUris: ['com.example.app:/cb', 'capacitor://localhost/cb', 'https://app.example.com/cb', 'https://app.example.com/other'] }
    expect(normalizeConfiguredClients([client])[0]!.corsOrigins).toEqual(['capacitor://localhost', 'https://app.example.com'])
    expect(normalizeConfiguredClients([{ ...client, corsOrigins: false }])[0]!.corsOrigins).toEqual([])
    expect(normalizeConfiguredClients([{ ...client, corsOrigins: ['https://localhost'] }])[0]!.corsOrigins).toEqual(['https://localhost'])
    for (const origin of ['*', 'https://app.example.com/', 'https://app.example.com/path', 'com.example.app:']) {
      expect(() => normalizeConfiguredClients([{ ...client, corsOrigins: [origin] }]), origin).toThrow(/exact origins/)
    }
  })

  it('lists a client unless told otherwise', () => {
    expect(normalizeConfiguredClients([mobile])[0]!.isListed).toBe(true)
    expect(normalizeConfiguredClients([{ ...mobile, listed: false }])[0]!.isListed).toBe(false)
    expect(() => normalizeConfiguredClients([{ ...mobile, listed: 'no' }])).toThrow(/listed must be/)
  })

  it('cleans up names and texts', () => {
    const [client] = normalizeConfiguredClients([{ ...mobile, allowedRoles: ['staff', 'member', 'staff'], tags: ['b', 'a', 'a'], description: '  Hi ', icon: '' }])
    expect(client).toMatchObject({ allowedRoles: ['member', 'staff'], tags: ['b', 'a'], description: 'Hi', icon: null })
  })
})

const DAY = 60 * 60 * 24

describe('refresh-token policy', () => {
  it('defaults to 30 days idle without a cap, and the deprecated refreshTokenTtl alone still decides the idle time', () => {
    expect(resolveRefreshTokenOptions({})).toEqual({ idleTtl: 30 * DAY, maxAge: null })
    expect(DEFAULT_REFRESH_TOKEN_POLICY).toEqual({ idleTtl: 30 * DAY, maxAge: null })
    expect(resolveRefreshTokenOptions({ refreshTokenTtl: 30 * DAY })).toEqual({ idleTtl: 30 * DAY, maxAge: null })
    expect(resolveRefreshTokenOptions({ refreshTokenTtl: 7 * DAY })).toEqual({ idleTtl: 7 * DAY, maxAge: null })
    // `refreshToken.idleTtl` wins over the alias.
    expect(resolveRefreshTokenOptions({ refreshTokenTtl: 7 * DAY, refreshToken: { idleTtl: DAY, maxAge: 90 * DAY } })).toEqual({ idleTtl: DAY, maxAge: 90 * DAY })
    // Env values arrive as strings.
    expect(resolveRefreshTokenOptions({ refreshToken: { idleTtl: '3600' as unknown as number } })).toEqual({ idleTtl: 3600, maxAge: null })
  })

  it('refuses lifetimes that are not positive whole seconds, or above two years', () => {
    expect(() => resolveRefreshTokenOptions({ refreshToken: { idleTtl: 0 } })).toThrow(/positive whole number/)
    expect(() => resolveRefreshTokenOptions({ refreshToken: { idleTtl: 1.5 } })).toThrow(/positive whole number/)
    expect(() => resolveRefreshTokenOptions({ refreshToken: { idleTtl: 731 * DAY } })).toThrow(/two years/)
    expect(() => resolveRefreshTokenOptions({ refreshToken: { maxAge: 731 * DAY } })).toThrow(/refreshToken.maxAge may be at most two years/)
    expect(resolveRefreshTokenOptions({ refreshToken: { idleTtl: 730 * DAY } }).idleTtl).toBe(730 * DAY)
  })

  it('takes the application\'s values first, then the global ones', () => {
    const global = { idleTtl: 30 * DAY, maxAge: null }
    expect(resolveRefreshTokenPolicy({ refreshIdleTtl: null, refreshMaxAge: null }, global)).toEqual(global)
    expect(resolveRefreshTokenPolicy({ refreshIdleTtl: 180 * DAY, refreshMaxAge: null }, global)).toEqual({ idleTtl: 180 * DAY, maxAge: null })
    expect(resolveRefreshTokenPolicy({ refreshIdleTtl: null, refreshMaxAge: 7 * DAY }, { idleTtl: DAY, maxAge: 30 * DAY })).toEqual({ idleTtl: DAY, maxAge: 7 * DAY })
  })

  it('expires a token at now + idleTtl, capped at authTime + maxAge', () => {
    const now = new Date('2026-01-31T00:00:00Z')
    const authTime = new Date('2026-01-01T00:00:00Z')
    expect(refreshTokenExpiresAt({ idleTtl: 30 * DAY, maxAge: null }, authTime, now)).toEqual(new Date('2026-03-02T00:00:00Z'))
    // The sliding window would reach March, the cap ends the sign-in on 1 February.
    expect(refreshTokenExpiresAt({ idleTtl: 30 * DAY, maxAge: 31 * DAY }, authTime, now)).toEqual(new Date('2026-02-01T00:00:00Z'))
    // Past the cap the token is born expired.
    expect(refreshTokenExpiresAt({ idleTtl: 30 * DAY, maxAge: 10 * DAY }, authTime, now).getTime()).toBeLessThan(now.getTime())
  })

  it('tells native, browser and confidential clients apart', () => {
    expect(oauthClientKind({ clientType: 'confidential', websiteUrl: 'https://app.example.com' })).toBe('confidential')
    expect(oauthClientKind({ clientType: 'public', redirectUris: ['com.example.app:/cb', 'http://localhost:3000/cb'] })).toBe('native')
    expect(oauthClientKind({ clientType: 'public', redirectUris: ['capacitor://localhost/cb'] })).toBe('native')
    expect(oauthClientKind({ clientType: 'public', redirectUris: ['com.example.app:/cb', 'https://app.example.com/cb'] })).toBe('browser')
    expect(oauthClientKind({ clientType: 'public', websiteUrl: 'https://app.example.com', redirectUris: [] })).toBe('browser')
    expect(isLongBrowserSession({ clientType: 'public', redirectUris: ['https://app.example.com/cb'] }, 8 * DAY)).toBe(true)
    expect(isLongBrowserSession({ clientType: 'public', redirectUris: ['https://app.example.com/cb'] }, 7 * DAY)).toBe(false)
    expect(isLongBrowserSession({ clientType: 'public', redirectUris: ['com.example.app:/cb'] }, 365 * DAY)).toBe(false)
    expect(isLongBrowserSession({ clientType: 'confidential', websiteUrl: 'https://app.example.com' }, 365 * DAY)).toBe(false)
  })

  it('reads a configured client\'s refreshToken, warns about long browser sessions unless allowed, and refuses above two years', () => {
    const [native] = normalizeConfiguredClients([{ ...mobile, refreshToken: { idleTtl: 180 * DAY } }])
    expect(native!.refreshToken).toEqual({ idleTtl: 180 * DAY, maxAge: null })
    expect(configuredClientWarnings([native!], DEFAULT_REFRESH_TOKEN_POLICY)).toEqual([])

    const spa = { id: 'spa', name: 'SPA', redirectUris: ['https://spa.example.com/auth/callback'] }
    const [long] = normalizeConfiguredClients([{ ...spa, refreshToken: { idleTtl: 30 * DAY } }])
    expect(configuredClientWarnings([long!], DEFAULT_REFRESH_TOKEN_POLICY)).toEqual([expect.stringMatching(/"spa" is a browser client .* 30 days .*XSS/)])
    // The global default counts too: 30 days is long for a browser.
    const [inherits] = normalizeConfiguredClients([spa])
    expect(configuredClientWarnings([inherits!], DEFAULT_REFRESH_TOKEN_POLICY)).toHaveLength(1)
    expect(configuredClientWarnings([inherits!], { idleTtl: DAY, maxAge: null })).toEqual([])
    const [allowed] = normalizeConfiguredClients([{ ...spa, refreshToken: { idleTtl: 30 * DAY }, allowLongBrowserSessions: true }])
    expect(configuredClientWarnings([allowed!], DEFAULT_REFRESH_TOKEN_POLICY)).toEqual([])

    expect(() => normalizeConfiguredClients([{ ...mobile, refreshToken: { idleTtl: 3 * 365 * DAY } }])).toThrow(/Client "mobile": refreshToken.idleTtl may be at most two years/)
    expect(() => normalizeConfiguredClients([{ ...mobile, refreshToken: { maxAge: -1 } }])).toThrow(/refreshToken.maxAge must be a positive/)
    expect(() => normalizeConfiguredClients([{ ...mobile, refreshToken: 5 as never }])).toThrow(/refreshToken must be an object/)
    expect(() => normalizeConfiguredClients([{ ...mobile, allowLongBrowserSessions: 'yes' as never }])).toThrow(/allowLongBrowserSessions/)
  })
})

describe('isExactOrigin', () => {
  it('accepts scheme://host[:port] only', () => {
    expect(isExactOrigin('capacitor://localhost')).toBe(true)
    expect(isExactOrigin('http://localhost:3001')).toBe(true)
    expect(isExactOrigin('https://app.example.com/')).toBe(false)
    expect(isExactOrigin('*')).toBe(false)
    expect(isExactOrigin('com.example.app:')).toBe(false)
  })
})

describe('loadOrCreateDevSigningKey', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oauth-dev-key-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('generates a PKCS8 key once, private to the user, and reuses it', async () => {
    const path = join(dir, '.data', 'oauth-server', 'dev-key.pem')
    const first = loadOrCreateDevSigningKey(path)
    expect(first.created).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('BEGIN PRIVATE KEY')
    expect(statSync(path).mode & 0o077).toBe(0)
    await expect(importPKCS8(first.pem, 'RS256')).resolves.toBeDefined()

    const second = loadOrCreateDevSigningKey(path)
    expect(second).toEqual({ pem: first.pem, created: false })
  })
})
