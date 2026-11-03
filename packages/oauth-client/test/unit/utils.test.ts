import { describe, expect, it } from 'vitest'
import { isPublicPath, loopbackRewriter, resolveRedirectUri, safeReturnTo, shouldAttachToken } from '../../src/runtime/utils'
import { rewriteLoopbackUrl } from '../../src/runtime/core'

describe('resolveRedirectUri', () => {
  const base = { origin: 'http://localhost:3001', callbackPath: '/auth/callback', nativeRedirectUri: 'nu.frigear.app:/auth/callback' }

  it('uses the native redirect URI inside an app and the origin in a browser', () => {
    expect(resolveRedirectUri({ ...base, native: true })).toBe('nu.frigear.app:/auth/callback')
    expect(resolveRedirectUri({ ...base, native: false })).toBe('http://localhost:3001/auth/callback')
    expect(resolveRedirectUri({ ...base, native: false, redirectUri: 'https://app.test/cb' })).toBe('https://app.test/cb')
  })

  it('fails inside an app without a native scheme', () => {
    expect(() => resolveRedirectUri({ ...base, native: true, nativeRedirectUri: '' })).toThrow(/native.scheme/)
  })
})

describe('loopback rewrite', () => {
  it('points loopback URLs at the dev machine', () => {
    expect(rewriteLoopbackUrl('http://localhost:3000/oauth/token', '192.168.1.20')).toBe('http://192.168.1.20:3000/oauth/token')
    expect(rewriteLoopbackUrl('http://127.0.0.1:3000', '192.168.1.20')).toBe('http://192.168.1.20:3000')
    expect(rewriteLoopbackUrl('https://frigear.nu/oauth/token', '192.168.1.20')).toBe('https://frigear.nu/oauth/token')
  })

  it('only rewrites in development, unless a host is configured', () => {
    expect(loopbackRewriter(true, '192.168.1.20', false)).toBeUndefined()
    expect(loopbackRewriter(true, 'localhost', true)).toBeUndefined()
    expect(loopbackRewriter(false, '192.168.1.20', true)).toBeUndefined()
    expect(loopbackRewriter(true, '192.168.1.20', true)?.('http://localhost:3000')).toBe('http://192.168.1.20:3000')
    expect(loopbackRewriter('10.0.0.5', 'localhost', false)?.('http://localhost:3000/x')).toBe('http://10.0.0.5:3000/x')
  })
})

describe('isPublicPath', () => {
  it('matches exact paths and /** prefixes', () => {
    const patterns = ['/login', '/docs/**', '/']
    expect(isPublicPath('/login/', patterns)).toBe(true)
    expect(isPublicPath('/docs', patterns)).toBe(true)
    expect(isPublicPath('/docs/a/b', patterns)).toBe(true)
    expect(isPublicPath('/documents', patterns)).toBe(false)
    expect(isPublicPath('/', patterns)).toBe(true)
    expect(isPublicPath('/bills', patterns)).toBe(false)
  })
})

describe('safeReturnTo', () => {
  it('keeps same-app paths only', () => {
    expect(safeReturnTo('/bills?x=1')).toBe('/bills?x=1')
    expect(safeReturnTo('//evil.test')).toBeUndefined()
    expect(safeReturnTo('/\\evil.test')).toBeUndefined()
    expect(safeReturnTo('https://evil.test')).toBeUndefined()
    expect(safeReturnTo(['/a'])).toBeUndefined()
  })
})

describe('shouldAttachToken', () => {
  it('sends the token to the allowed origins only', () => {
    const attachTo = ['https://api.test', 'https://id.test/']
    expect(shouldAttachToken('/api/me', 'https://api.test/v1', attachTo)).toBe(true)
    expect(shouldAttachToken('https://id.test/oauth/userinfo', 'https://api.test', attachTo)).toBe(true)
    expect(shouldAttachToken('https://evil.test/collect', 'https://api.test', attachTo)).toBe(false)
    expect(shouldAttachToken('//evil.test/collect', 'https://api.test', attachTo)).toBe(false)
  })
})
