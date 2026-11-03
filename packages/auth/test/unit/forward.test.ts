import { describe, expect, it } from 'vitest'
import { shouldForwardCredentials } from '../../src/runtime/utils/forward'

const origin = 'https://app.test'

describe('shouldForwardCredentials (server-mode $api)', () => {
  it.each([
    ['a path', '/api/me', undefined],
    ['a path with a query', '/api/me?x=1', undefined],
    ['a URL on this origin', 'https://app.test/api/me', undefined],
    ['a path under a path baseURL', '/me', '/api'],
    ['a path under a baseURL on this origin', '/me', 'https://app.test/api'],
    ['a URL on this origin, whatever the baseURL', 'https://app.test/api/me', 'https://evil.test'],
    ['an uppercase scheme on this origin', 'HTTPS://app.test/api/me', undefined],
    ['a URL on this origin with surrounding whitespace', '  https://app.test/api/me', undefined],
  ])('forwards for %s', (_name, request, baseURL) => {
    expect(shouldForwardCredentials(request, baseURL, origin)).toBe(true)
  })

  it.each([
    ['another origin', 'https://api.other.test/me', undefined],
    ['another port', 'https://app.test:8443/me', undefined],
    ['another scheme', 'http://app.test/me', undefined],
    ['a protocol-relative URL', '//evil.test/me', undefined],
    ['a backslash path', '/\\evil.test/me', undefined],
    ['a relative path', 'api/me', undefined],
    ['a path under a baseURL on another origin', '/me', 'https://api.other.test'],
    ['a path under a protocol-relative baseURL', '/me', '//evil.test'],
    ['a path under a relative baseURL', '/me', 'api'],
    ['a path under an unparsable baseURL', '/me', 'http://'],
    ['userinfo that looks like this host', 'https://app.test@evil.test/me', undefined],
    ['userinfo on another host', 'https://user:pass@evil.test/me', undefined],
    ['an encoded host', 'https://evil%2Etest/me', undefined],
    ['a protocol-relative URL with whitespace', ' //evil.test/me', undefined],
  ])('does not forward for %s', (_name, request, baseURL) => {
    expect(shouldForwardCredentials(request, baseURL, origin)).toBe(false)
  })
})
