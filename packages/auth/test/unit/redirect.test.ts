import { describe, expect, it } from 'vitest'
import { authModeHasServer, authModeSignsInAtIssuer, isSafeRedirect, resolveAuthMode } from '../../src/runtime/mode'

describe('isSafeRedirect', () => {
  it.each(['/', '/account', '/bills?x=1#top', '/a/b/c', '/oauth/authorize?client_id=x'])('accepts %s', (path) => {
    expect(isSafeRedirect(path)).toBe(true)
  })

  it.each([
    ['a full URL', 'https://evil.test'],
    ['a relative path', 'account'],
    ['protocol-relative', '//evil.test'],
    ['a backslash after the slash', '/\\evil.test'],
    ['a backslash anywhere', '/a\\b'],
    ['a tab', '/\t/evil.test'],
    ['a newline', '/\n/evil.test'],
    ['a NUL', '/a\u0000'],
    ['DEL', '/a\u007F'],
    ['an empty string', ''],
  ])('rejects %s', (_name, path) => {
    expect(isSafeRedirect(path)).toBe(false)
  })

  it('rejects anything that is not a string', () => {
    expect(isSafeRedirect(undefined)).toBe(false)
    expect(isSafeRedirect(['/a'])).toBe(false)
    expect(isSafeRedirect(1)).toBe(false)
  })
})

describe('resolveAuthMode', () => {
  const nuxt = (authentication?: unknown) => ({ options: { authentication } })

  it('defaults to server and reads the app\'s own mode', () => {
    expect(resolveAuthMode(nuxt())).toBe('server')
    expect(resolveAuthMode(nuxt({}))).toBe('server')
    expect(resolveAuthMode(nuxt({ mode: 'server' }))).toBe('server')
    expect(resolveAuthMode(nuxt({ mode: 'client' }))).toBe('client')
    expect(resolveAuthMode(nuxt({ mode: 'resource' }))).toBe('resource')
  })

  it('tells which modes have a server half and which sign in at an issuer', () => {
    expect([authModeHasServer('server'), authModeHasServer('client'), authModeHasServer('resource')]).toEqual([true, false, true])
    expect([authModeSignsInAtIssuer('server'), authModeSignsInAtIssuer('client'), authModeSignsInAtIssuer('resource')]).toEqual([false, true, true])
  })

  it('throws on anything else', () => {
    expect(() => resolveAuthMode(nuxt({ mode: 'spa' }))).toThrow(/must be 'server', 'client' or 'resource', got "spa"/)
    expect(() => resolveAuthMode(nuxt({ mode: null }))).toThrow(/must be 'server', 'client' or 'resource'/)
  })
})
