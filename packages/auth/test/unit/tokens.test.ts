import { describe, expect, it } from 'vitest'
import {
  LAST_USED_THROTTLE_MS,
  USER_TOKEN_PREFIX,
  describeToken,
  generateUserToken,
  hashToken,
  looksLikeJwt,
  parseBearer,
  shouldTouchLastUsed,
  tokenStatus,
} from '../../src/runtime/utils/tokens'

describe('generateUserToken', () => {
  it('creates a prefixed, url-safe, unique token', async () => {
    const a = await generateUserToken()
    const b = await generateUserToken()
    expect(a.token.startsWith(USER_TOKEN_PREFIX)).toBe(true)
    expect(a.token).toMatch(/^fnu_[\w-]{43}$/)
    expect(a.token).not.toBe(b.token)
  })

  it('stores only the hash and display fragments', async () => {
    const { token, tokenHash, prefix, last4 } = await generateUserToken()
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).toBe(await hashToken(token))
    expect(prefix).toBe(token.slice(0, 8))
    expect(last4).toBe(token.slice(-4))
    expect(tokenHash).not.toContain(token)
  })
})

describe('hashToken', () => {
  it('is a stable SHA-256 hex', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await describeToken('abc')).toMatchObject({ tokenHash: await hashToken('abc') })
  })
})

describe('parseBearer', () => {
  it('extracts the token, case-insensitively', () => {
    expect(parseBearer('Bearer abc')).toBe('abc')
    expect(parseBearer('bearer   abc  ')).toBe('abc')
    expect(parseBearer('BEARER abc')).toBe('abc')
  })

  it('ignores other schemes and malformed headers', () => {
    expect(parseBearer('Basic abc')).toBeNull()
    expect(parseBearer('Bearer')).toBeNull()
    expect(parseBearer('Bearer a b')).toBeNull()
    expect(parseBearer('')).toBeNull()
    expect(parseBearer(undefined)).toBeNull()
  })
})

describe('looksLikeJwt', () => {
  it('recognises three base64url segments only', () => {
    expect(looksLikeJwt('aaa.bbb.ccc')).toBe(true)
    expect(looksLikeJwt('fnu_abc')).toBe(false)
    expect(looksLikeJwt('a.b')).toBe(false)
    expect(looksLikeJwt('a.b.c.d')).toBe(false)
  })
})

describe('tokenStatus', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('is ok without revocation or expiry', () => {
    expect(tokenStatus({}, now)).toBe('ok')
    expect(tokenStatus({ expiresAt: null, revokedAt: null }, now)).toBe('ok')
    expect(tokenStatus({ expiresAt: new Date('2026-01-02T00:00:00Z') }, now)).toBe('ok')
  })

  it('is expired at and after the expiry instant', () => {
    expect(tokenStatus({ expiresAt: now }, now)).toBe('expired')
    expect(tokenStatus({ expiresAt: new Date('2025-12-31T00:00:00Z') }, now)).toBe('expired')
  })

  it('prefers revoked over expired', () => {
    expect(tokenStatus({ revokedAt: now, expiresAt: new Date('2025-01-01T00:00:00Z') }, now)).toBe('revoked')
  })
})

describe('shouldTouchLastUsed', () => {
  const now = new Date('2026-01-01T12:00:00Z')

  it('writes when never used or the throttle elapsed', () => {
    expect(shouldTouchLastUsed(null, now)).toBe(true)
    expect(shouldTouchLastUsed(new Date(now.getTime() - LAST_USED_THROTTLE_MS), now)).toBe(true)
  })

  it('skips writes inside the throttle window', () => {
    expect(shouldTouchLastUsed(new Date(now.getTime() - 1000), now)).toBe(false)
  })
})
