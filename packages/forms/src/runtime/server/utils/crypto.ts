import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * AES-256-GCM for values stored in the database (per-form secrets). The key is derived with scrypt from
 * `runtimeConfig.forms.encryptionKey` (env `NUXT_FORMS_ENCRYPTION_KEY`), else `NUXT_ENCRYPTION_KEY`, else
 * the session password (`NUXT_SESSION_PASSWORD`), so it works out of the box.
 *
 * Key rotation caveat: changing the key (or the session password it falls back to) makes every stored
 * secret unreadable. Decryption then fails with a `FormsDecryptionError`; admins have to enter the secrets again.
 */

const KEY_LENGTH = 32
// A fixed, non-secret context string for the key derivation; the entropy comes from the configured secret.
const SCRYPT_SALT = 'frigear-nu:forms:encrypted-json'

/** Shared through `globalThis`: `@nuxthub/db` may bundle this file a second time, apart from the Nitro plugin that initialises the key. */
const store = globalThis as typeof globalThis & { __frigearFormsKey?: Buffer }

export class FormsDecryptionError extends Error {
  override name = 'FormsDecryptionError'
  constructor(message = 'Stored secrets could not be decrypted. The encryption key has changed or the data is corrupt.', options?: { cause?: unknown }) {
    super(message, options)
  }
}

/** True for a `FormsDecryptionError`, also across separately bundled copies of this file. */
export const isDecryptionError = (error: unknown): boolean => error instanceof Error && error.name === 'FormsDecryptionError'

export function initEncryptionKey(secret: string | undefined | null) {
  store.__frigearFormsKey = secret ? scryptSync(secret, SCRYPT_SALT, KEY_LENGTH) : undefined
}

function requireKey(): Buffer {
  if (!store.__frigearFormsKey) {
    const secret = process.env.NUXT_FORMS_ENCRYPTION_KEY || process.env.NUXT_ENCRYPTION_KEY || process.env.NUXT_SESSION_PASSWORD
    if (secret) initEncryptionKey(secret)
  }
  if (!store.__frigearFormsKey) {
    throw new Error('[forms] No encryption key: set NUXT_FORMS_ENCRYPTION_KEY, NUXT_ENCRYPTION_KEY or NUXT_SESSION_PASSWORD.')
  }
  return store.__frigearFormsKey
}

/** Encrypts any JSON value into a `{ ct, iv, tag }` string with a fresh random 12-byte IV. */
export function encryptSync(plaintext: unknown): string {
  const key = requireKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()])
  return JSON.stringify({
    ct: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  })
}

export function decryptSync(raw: string): unknown {
  const key = requireKey()
  try {
    const { ct, iv, tag } = JSON.parse(raw)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  }
  catch (cause) {
    throw new FormsDecryptionError(undefined, { cause })
  }
}

declare global {
  var __frigearFormsCrypto: { encrypt: (value: unknown) => string, decrypt: (raw: string) => unknown } | undefined
}

// The `form_secrets` schema column reaches the cipher through here (see `db/schema.sqlite.ts`).
globalThis.__frigearFormsCrypto = { encrypt: encryptSync, decrypt: decryptSync }
