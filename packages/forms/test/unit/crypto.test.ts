import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const secret = 'a-very-secret-passphrase-for-tests'
const modulePath = '../../src/runtime/server/utils/crypto'
const store = globalThis as typeof globalThis & { __frigearFormsKey?: Buffer }

describe('forms crypto', () => {
  const env = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    store.__frigearFormsKey = undefined
    Reflect.deleteProperty(process.env, 'NUXT_FORMS_ENCRYPTION_KEY')
    Reflect.deleteProperty(process.env, 'NUXT_ENCRYPTION_KEY')
    Reflect.deleteProperty(process.env, 'NUXT_SESSION_PASSWORD')
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
})
