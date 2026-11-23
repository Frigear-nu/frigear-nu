import { describe, expect, it } from 'vitest'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  bytesToHex,
  deriveHkdfKey,
  hmacSha256Hex,
  sha256Base64Url,
  sha256Hex,
  timingSafeEqual,
  verifyHmacSha256Hex,
} from '../src/runtime/utils/crypto'
import { newId, randomToken } from '../src/runtime/utils/id'
import * as server from '../src/runtime/server'

describe('hashes and HMAC (known-answer vectors)', () => {
  it('sha256Hex: FIPS 180-2 "abc", the empty string and UTF-8 text', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Hex('ærø')).toBe('4a74d1ce8f359768751b351dbe8cf8b8e75febee160c080887ae3cbf96aa1912')
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(await sha256Hex('abc'))
  })

  it('sha256Base64Url: "abc" and the PKCE S256 example of RFC 7636 appendix B', async () => {
    expect(await sha256Base64Url('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0')
    expect(await sha256Base64Url('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('hmacSha256Hex: RFC 4231 test case 2', async () => {
    expect(await hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('verifyHmacSha256Hex accepts the signature in any case and nothing else', async () => {
    const signature = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'
    expect(await verifyHmacSha256Hex('Jefe', 'what do ya want for nothing?', signature)).toBe(true)
    expect(await verifyHmacSha256Hex('Jefe', 'what do ya want for nothing?', signature.toUpperCase())).toBe(true)
    expect(await verifyHmacSha256Hex('Jefe', 'what do ya want for nothing!', signature)).toBe(false)
    expect(await verifyHmacSha256Hex('jefe', 'what do ya want for nothing?', signature)).toBe(false)
    expect(await verifyHmacSha256Hex('Jefe', 'what do ya want for nothing?', signature.slice(0, 63))).toBe(false)
  })

  it('deriveHkdfKey gives the HKDF-SHA-256 key of node:crypto (an HMAC over a known payload)', async () => {
    const key = await deriveHkdfKey('secret', { salt: '@frigear-nu/shifts', info: 'shift_station_tokens' }, { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('stn_1:42'))
    // node -e "const c=require('crypto');c.createHmac('sha256',Buffer.from(c.hkdfSync('sha256','secret','@frigear-nu/shifts','shift_station_tokens',32))).update('stn_1:42').digest('hex')"
    expect(bytesToHex(signature)).toBe('3be2a43a43f407eb5f31e6b369d3346fd5f78aaf2ab43c17fc544d311ec026e3')
  })
})

describe('encodings', () => {
  it('hex and base64url round-trip and match the RFC 4648 vectors', () => {
    const bytes = new TextEncoder().encode('foobar')
    expect(bytesToHex(bytes)).toBe('666f6f626172')
    expect(bytesToBase64Url(bytes)).toBe('Zm9vYmFy')
    expect(bytesToBase64Url(new TextEncoder().encode('fo'))).toBe('Zm8')
    expect(bytesToBase64Url(new Uint8Array([0xFB, 0xFF]))).toBe('-_8')
    expect([...base64UrlToBytes('-_8')]).toEqual([0xFB, 0xFF])
    expect(new TextDecoder().decode(base64UrlToBytes('Zm9vYmFy'))).toBe('foobar')
    expect(bytesToHex(bytes.buffer)).toBe('666f6f626172')
  })

  it('base64UrlToBytes throws on characters outside the alphabet', () => {
    expect(() => base64UrlToBytes('not base64!')).toThrow()
  })
})

describe('timingSafeEqual', () => {
  it('is true only for equal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('', '')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('abc', '')).toBe(false)
    expect(timingSafeEqual('æ', 'ae')).toBe(false)
  })
})

describe('newId and randomToken', () => {
  it('newId is 32 hex characters, after the prefix', () => {
    expect(newId('opr')).toMatch(/^opr_[0-9a-f]{32}$/)
    expect(newId()).toMatch(/^[0-9a-f]{32}$/)
    expect(newId('opr')).not.toBe(newId('opr'))
  })

  it('randomToken is 32 random bytes as base64url by default, or hex', () => {
    expect(randomToken()).toMatch(/^[\w-]{43}$/)
    expect(randomToken(32, 'hex')).toMatch(/^[0-9a-f]{64}$/)
    expect(randomToken(16)).toMatch(/^[\w-]{22}$/)
    expect(randomToken()).not.toBe(randomToken())
  })

  it('is exported from /server too', () => {
    expect(server.newId).toBe(newId)
    expect(server.sha256Hex).toBe(sha256Hex)
  })
})
