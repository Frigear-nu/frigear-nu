import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hmacSha256Hex, signSha256, timingSafeEqual, verifySha256Signature } from '../../src/runtime/utils/signature'

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
})
