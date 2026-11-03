import { describe, expect, it } from 'vitest'
import { claimsOf, mapClaimsToUser, sessionIdOf } from '../../../src/runtime/client/app/utils/user'
import type { OAuthTokens } from '../../../src/runtime/client/core'
import { jwt } from './helpers'

const stored = (idToken: string | null, sessionId?: string): OAuthTokens =>
  ({ accessToken: 'a', refreshToken: 'r', idToken, tokenType: 'Bearer', expiresAt: 0, scope: 'openid', sessionId })

describe('claimsOf', () => {
  it('reads the stored id_token', () => {
    expect(claimsOf(stored(jwt({ sub: '42', name: 'Ada' })))).toMatchObject({ sub: '42', name: 'Ada' })
  })

  it('has no claims without an id_token, an unreadable one or one without a subject', () => {
    expect(claimsOf(null)).toBeNull()
    expect(claimsOf(stored(null))).toBeNull()
    expect(claimsOf(stored('not-a-jwt'))).toBeNull()
    expect(claimsOf(stored(jwt({ name: 'Ada' })))).toBeNull()
    expect(claimsOf(stored(jwt({ sub: '' })))).toBeNull()
  })
})

describe('mapClaimsToUser', () => {
  const base = { iss: 'https://id.test', aud: 'app', exp: 1, sub: '42' }

  it('maps the profile claims, with the subject as id', () => {
    expect(mapClaimsToUser({ ...base, name: 'Ada', email: 'ada@example.test', picture: 'https://img.test/a.png' }))
      .toEqual({ id: '42', sub: '42', name: 'Ada', email: 'ada@example.test', avatar: 'https://img.test/a.png' })
  })

  it('sets a role only from a string role claim', () => {
    expect(mapClaimsToUser({ ...base, role: 'admin' })).toEqual({ id: '42', sub: '42', role: 'admin' })
    expect(mapClaimsToUser({ ...base, role: ['admin'] })).toEqual({ id: '42', sub: '42' })
    expect(mapClaimsToUser(base)).toEqual({ id: '42', sub: '42' })
  })
})

describe('sessionIdOf', () => {
  it('uses the id of the sign-in, else the subject and sign-in time', () => {
    const claims = { iss: 'x', aud: 'app', exp: 1, sub: '42', auth_time: 100, iat: 200 }
    expect(sessionIdOf(stored('t', 'abc'), claims)).toBe('abc')
    expect(sessionIdOf(stored('t'), claims)).toBe('42:100')
    expect(sessionIdOf(stored('t'), { ...claims, auth_time: undefined })).toBe('42:200')
  })
})
