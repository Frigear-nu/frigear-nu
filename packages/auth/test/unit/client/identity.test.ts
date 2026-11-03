import { describe, expect, it } from 'vitest'
import { claimsOf } from '../../../src/runtime/client/app/utils/user'
import type { OAuthTokens } from '../../../src/runtime/client/core'
import { jwt } from './helpers'

const stored = (claims: Record<string, unknown>): OAuthTokens =>
  ({ accessToken: 'a', refreshToken: 'r', idToken: jwt(claims), tokenType: 'Bearer', expiresAt: 0, scope: 'openid' })
const expected = { issuer: 'https://id.test/', clientId: 'app' }

// The tokens are stored per client id only: a session of another issuer (the config changed) must not be restored.
describe('claimsOf with the expected identity', () => {
  it('accepts this issuer and client', () => {
    expect(claimsOf(stored({ iss: 'https://id.test', aud: 'app', sub: '1' }), expected)?.sub).toBe('1')
    expect(claimsOf(stored({ iss: 'https://id.test', aud: ['api', 'app'], sub: '1' }), expected)?.sub).toBe('1')
  })

  it('rejects another issuer or audience', () => {
    expect(claimsOf(stored({ iss: 'https://other.test', aud: 'app', sub: '1' }), expected)).toBeNull()
    expect(claimsOf(stored({ aud: 'app', sub: '1' }), expected)).toBeNull()
    expect(claimsOf(stored({ iss: 'https://id.test', aud: 'other', sub: '1' }), expected)).toBeNull()
  })

  it('compares issuers after the loopback rewrite', () => {
    const rewrite = (url: string) => url.replace('localhost', '192.168.1.20').replace(/\/+$/, '')
    const local = { issuer: 'http://localhost:3000', clientId: 'app', normalizeIssuer: rewrite }
    expect(claimsOf(stored({ iss: 'http://192.168.1.20:3000', aud: 'app', sub: '1' }), local)?.sub).toBe('1')
  })
})
