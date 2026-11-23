import { createHash, createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { hmacSha256Hex, sha256Hex, timingSafeEqual } from '@frigear-nu/module-kit/crypto'
import { secretsEqual, signSha256, verifySha256Signature } from '../../src/runtime/utils/signature'

describe('webhook signatures', () => {
  const body = JSON.stringify({ object: 'page', entry: [{ id: '1' }] })

  it('computes the same HMAC-SHA256 as node', async () => {
    expect(await hmacSha256Hex('secret', body)).toBe(createHmac('sha256', 'secret').update(body).digest('hex'))
  })

  it('verifies a `sha256=<hex>` header, in any case', async () => {
    const header = await signSha256('secret', body)
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(await verifySha256Signature('secret', body, header)).toBe(true)
    expect(await verifySha256Signature('secret', body, header.toUpperCase().replace('SHA256=', 'sha256='))).toBe(true)
    expect(await verifySha256Signature('secret', new TextEncoder().encode(body), header)).toBe(true)
  })

  it('refuses another secret, another body, a malformed header or no secret at all', async () => {
    const header = await signSha256('secret', body)
    expect(await verifySha256Signature('other', body, header)).toBe(false)
    expect(await verifySha256Signature('secret', `${body} `, header)).toBe(false)
    expect(await verifySha256Signature('secret', body, header.replace('sha256=', 'sha1='))).toBe(false)
    expect(await verifySha256Signature('secret', body, 'sha256=abc')).toBe(false)
    expect(await verifySha256Signature('secret', body, undefined)).toBe(false)
    expect(await verifySha256Signature('', body, header)).toBe(false)
    expect(await verifySha256Signature(undefined, body, header)).toBe(false)
  })

  it('compares strings without an early exit', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })

  it('compares a verify token in constant time, whatever its length', async () => {
    expect(await secretsEqual('test-verify-token', 'test-verify-token')).toBe(true)
    expect(await secretsEqual('test-verify-tokeN', 'test-verify-token')).toBe(false)
    expect(await secretsEqual('test', 'test-verify-token')).toBe(false)
    expect(await secretsEqual('test-verify-token-and-more', 'test-verify-token')).toBe(false)
    expect(await secretsEqual('', 'test-verify-token')).toBe(false)
    // A shorter token is not refused early: both sides are HMAC-ed, then the equal-length digests compared.
    const sign = vi.spyOn(crypto.subtle, 'sign')
    await secretsEqual('x', 'a-much-longer-expected-token')
    expect(sign).toHaveBeenCalledTimes(2)
    sign.mockRestore()
  })

  it('hashes text with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe(createHash('sha256').update('abc').digest('hex'))
  })
})
