import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secret = 'a-very-secret-passphrase-for-tests'
const modulePath = '../../src/runtime/server/utils/crypto'
const APP_SECRET = 'a-test-only-app-secret-at-least-32-characters'
const store = globalThis as typeof globalThis & { __frigearFormsKey?: Buffer }

describe('forms crypto', () => {
  const env = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    store.__frigearFormsKey = undefined
    Reflect.deleteProperty(process.env, 'NUXT_FORMS_ENCRYPTION_KEY')
    Reflect.deleteProperty(process.env, 'NUXT_ENCRYPTION_KEY')
    Reflect.deleteProperty(process.env, 'NUXT_SESSION_PASSWORD')
    Reflect.deleteProperty(process.env, 'NUXT_APP_SECRET')
  })
  afterEach(() => {
    process.env = { ...env }
    store.__frigearFormsKey = undefined
  })

  it('round-trips a value and keeps the plaintext out of the ciphertext', async () => {
    const { initEncryptionKey, encryptSync, decryptSync } = await import(modulePath)
    initEncryptionKey(secret)
    const payload = { 'captcha.turnstile.secretKey': 'super-secret-value', 'nested': { count: 1 } }
    const encrypted = encryptSync(payload)
    expect(encrypted).not.toContain('super-secret-value')
    expect(Object.keys(JSON.parse(encrypted)).sort()).toEqual(['ct', 'iv', 'tag'])
    expect(decryptSync(encrypted)).toEqual(payload)
  })

  it('uses a fresh IV per encryption', async () => {
    const { initEncryptionKey, encryptSync } = await import(modulePath)
    initEncryptionKey(secret)
    const records = Array.from({ length: 50 }, () => JSON.parse(encryptSync({ a: 'same' })))
    expect(new Set(records.map(record => record.iv)).size).toBe(50)
    expect(new Set(records.map(record => record.ct)).size).toBe(50)
    expect(Buffer.from(records[0].iv, 'base64')).toHaveLength(12)
  })

  it('fails to decrypt with another key', async () => {
    const { initEncryptionKey, encryptSync, decryptSync, isDecryptionError } = await import(modulePath)
    initEncryptionKey(secret)
    const encrypted = encryptSync({ a: 'b' })
    initEncryptionKey('another-passphrase-entirely')
    expect(() => decryptSync(encrypted)).toThrow(/could not be decrypted/)
    try {
      decryptSync(encrypted)
    }
    catch (error) {
      expect(isDecryptionError(error)).toBe(true)
    }
  })

  it('fails to decrypt tampered data', async () => {
    const { initEncryptionKey, encryptSync, decryptSync } = await import(modulePath)
    initEncryptionKey(secret)
    const record = JSON.parse(encryptSync({ a: 'b' }))
    const ct = Buffer.from(record.ct, 'base64')
    ct[0] = ct[0]! ^ 1
    expect(() => decryptSync(JSON.stringify({ ...record, ct: ct.toString('base64') }))).toThrow(/could not be decrypted/)
    const tag = Buffer.from(record.tag, 'base64')
    tag[0] = tag[0]! ^ 1
    expect(() => decryptSync(JSON.stringify({ ...record, tag: tag.toString('base64') }))).toThrow(/could not be decrypted/)
    expect(() => decryptSync('not json')).toThrow(/could not be decrypted/)
  })

  it('throws a clear error without any key', async () => {
    const { encryptSync } = await import(modulePath)
    expect(() => encryptSync({ a: 'b' })).toThrow('No encryption key')
    expect(() => encryptSync({ a: 'b' })).toThrow(/NUXT_APP_SECRET.*NUXT_FORMS_ENCRYPTION_KEY/)
  })

  it('reads the deprecated NUXT_SESSION_PASSWORD lazily even when NUXT_APP_SECRET is set', async () => {
    process.env.NUXT_APP_SECRET = APP_SECRET
    process.env.NUXT_SESSION_PASSWORD = secret
    const { encryptSync } = await import(modulePath)
    const encrypted = encryptSync({ a: 'b' })
    store.__frigearFormsKey = undefined
    const { initEncryptionKey, decryptSync } = await import(modulePath)
    initEncryptionKey(secret)
    expect(decryptSync(encrypted)).toEqual({ a: 'b' })
  })

  it.each([
    ['NUXT_FORMS_ENCRYPTION_KEY'],
    ['NUXT_ENCRYPTION_KEY'],
    ['NUXT_SESSION_PASSWORD'],
  ])('initialises itself from %s', async (name) => {
    process.env[name] = secret
    const { encryptSync, decryptSync } = await import(modulePath)
    expect(decryptSync(encryptSync({ a: 'b' }))).toEqual({ a: 'b' })
  })

  it('prefers the forms key over the global and session ones', async () => {
    process.env.NUXT_SESSION_PASSWORD = 'session-password-value'
    process.env.NUXT_FORMS_ENCRYPTION_KEY = secret
    const { encryptSync } = await import(modulePath)
    const encrypted = encryptSync({ a: 'b' })
    store.__frigearFormsKey = undefined
    delete process.env.NUXT_FORMS_ENCRYPTION_KEY
    const { decryptSync } = await import(modulePath)
    expect(() => decryptSync(encrypted)).toThrow(/could not be decrypted/)
  })

  /** Nuxt's `deriveSecret` (nuxt/dist/server/secret.js), reimplemented with WebCrypto. */
  async function nuxtDeriveSecret(appSecret: string, purpose: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), 'HKDF', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('nuxt'), info: encoder.encode(purpose) }, key, 256)
    return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('')
  }

  it('derives the same secret from NUXT_APP_SECRET as Nuxt\'s deriveSecret', async () => {
    const { deriveAppSecretSync, ENCRYPTION_KEY_PURPOSE } = await import(modulePath)
    expect(ENCRYPTION_KEY_PURPOSE).toBe('@frigear-nu/forms:encryption')
    expect(deriveAppSecretSync(APP_SECRET, ENCRYPTION_KEY_PURPOSE)).toBe(await nuxtDeriveSecret(APP_SECRET, ENCRYPTION_KEY_PURPOSE))
    expect(deriveAppSecretSync(APP_SECRET, 'other')).toBe(await nuxtDeriveSecret(APP_SECRET, 'other'))
    expect(deriveAppSecretSync('too-short', ENCRYPTION_KEY_PURPOSE)).toBe('')
    expect(deriveAppSecretSync(undefined, ENCRYPTION_KEY_PURPOSE)).toBe('')
  })

  it('initialises itself from NUXT_APP_SECRET with the key the plugin would set', async () => {
    process.env.NUXT_APP_SECRET = APP_SECRET
    const { encryptSync, initEncryptionKey, decryptSync, ENCRYPTION_KEY_PURPOSE } = await import(modulePath)
    const encrypted = encryptSync({ a: 'b' })
    delete process.env.NUXT_APP_SECRET
    initEncryptionKey(await nuxtDeriveSecret(APP_SECRET, ENCRYPTION_KEY_PURPOSE))
    expect(decryptSync(encrypted)).toEqual({ a: 'b' })
  })

  it('ignores an NUXT_APP_SECRET shorter than 32 characters', async () => {
    process.env.NUXT_APP_SECRET = 'too-short'
    const { encryptSync } = await import(modulePath)
    expect(() => encryptSync({ a: 'b' })).toThrow('No encryption key')
  })
})
