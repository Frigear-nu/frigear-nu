import { describe, expect, it } from 'vitest'
import { resolveSameOriginUrl } from '../src/runtime/utils/url'

describe('resolveSameOriginUrl', () => {
  const origin = 'https://example.com'
  it('accepts relative paths and same-origin absolute URLs', () => {
    expect(resolveSameOriginUrl('/ok?x=1', origin)).toBe('https://example.com/ok?x=1')
    expect(resolveSameOriginUrl('https://example.com/a?s={CHECKOUT_SESSION_ID}', origin)).toBe('https://example.com/a?s={CHECKOUT_SESSION_ID}')
  })
  it('rejects other origins and protocol-relative URLs', () => {
    expect(resolveSameOriginUrl('https://evil.com/x', origin)).toBeNull()
    expect(resolveSameOriginUrl('//evil.com', origin)).toBeNull()
    expect(resolveSameOriginUrl('/\\evil.com', origin)).toBeNull()
    expect(resolveSameOriginUrl('javascript:alert(1)', origin)).toBeNull()
    expect(resolveSameOriginUrl('relative/path', origin)).toBeNull()
  })
})
