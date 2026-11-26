import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@frigear-nu/module-kit/crypto'
import { campaignsHashToken, campaignsNewConfirmToken, hashIp, parseUnsubscribeToken, signUnsubscribeToken, verifyUnsubscribeToken } from '../../src/runtime/utils/tokens'

const hmacKey = () => crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])
const subscriptionId = `cms_${'ab12'.repeat(8)}`

describe('confirmation tokens', () => {
  it('stores the SHA-256 of the token, never the token', async () => {
    const { token, hash } = await campaignsNewConfirmToken()
    expect(token).toMatch(/^[\w-]{43}$/)
    expect(hash).toBe(await sha256Hex(token))
    expect(hash).not.toContain(token)
    expect(await campaignsHashToken(token)).toBe(hash)
  })

  it('makes a different token every time', async () => {
    const [a, b] = await Promise.all([campaignsNewConfirmToken(), campaignsNewConfirmToken()])
    expect(a.token).not.toBe(b.token)
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('unsubscribe tokens', () => {
  it('names the subscription and verifies with the key that signed it', async () => {
    const key = await hmacKey()
    const token = await signUnsubscribeToken(key, subscriptionId)
    expect(token.startsWith(`${subscriptionId}.`)).toBe(true)
    expect(await verifyUnsubscribeToken(key, token)).toBe(subscriptionId)
  })

  it('refuses another key, an altered subject and an altered signature', async () => {
    const key = await hmacKey()
    const token = await signUnsubscribeToken(key, subscriptionId)
    expect(await verifyUnsubscribeToken(await hmacKey(), token)).toBeNull()
    const other = `cms_${'cd34'.repeat(8)}`
    expect(await verifyUnsubscribeToken(key, token.replace(subscriptionId, other))).toBeNull()
    const signature = token.split('.')[1]!
    const flipped = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(await verifyUnsubscribeToken(key, `${subscriptionId}.${flipped}`)).toBeNull()
  })

  it('reuses for any record id of the same shape (campaign deliveries later)', async () => {
    const key = await hmacKey()
    const delivery = `cmd_${'ef56'.repeat(8)}`
    expect(await verifyUnsubscribeToken(key, await signUnsubscribeToken(key, delivery))).toBe(delivery)
  })

  it('does not parse what is not shaped like a token', async () => {
    expect(parseUnsubscribeToken('')).toBeNull()
    expect(parseUnsubscribeToken('nodot')).toBeNull()
    expect(parseUnsubscribeToken(`${subscriptionId}.short`)).toBeNull()
    expect(parseUnsubscribeToken(`../etc.${'a'.repeat(43)}`)).toBeNull()
    await expect(signUnsubscribeToken(await hmacKey(), 'not-an-id')).rejects.toThrow()
  })
})

describe('IP hashes', () => {
  it('are keyed and stable, and never contain the address', async () => {
    const key = await hmacKey()
    const hash = await hashIp(key, '203.0.113.7')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('203.0.113.7')
    expect(await hashIp(key, '203.0.113.7')).toBe(hash)
    expect(await hashIp(key, '203.0.113.8')).not.toBe(hash)
    expect(await hashIp(await hmacKey(), '203.0.113.7')).not.toBe(hash)
    // Not a plain SHA-256 of the address, which anyone could reverse for IPv4.
    expect(hash).not.toBe(await sha256Hex('203.0.113.7'))
  })
})
