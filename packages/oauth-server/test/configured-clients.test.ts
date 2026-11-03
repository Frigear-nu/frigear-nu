import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { importPKCS8 } from 'jose'
import { isExactOrigin, normalizeConfiguredClients } from '../src/runtime/utils'
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
      corsOrigins: [],
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
