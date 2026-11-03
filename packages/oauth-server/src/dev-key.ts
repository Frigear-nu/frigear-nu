import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Build-time only (the module's `setup()` under `nuxt dev`): never imported by the runtime.

/**
 * The PKCS8 PEM at `path`, generated (RSA 2048) and written there with mode 0600 when it does not exist yet. Returns
 * whether it was created now. Throws when the file cannot be read or written.
 */
export function loadOrCreateDevSigningKey(path: string): { pem: string, created: boolean } {
  if (existsSync(path)) {
    const pem = readFileSync(path, 'utf8').trim()
    if (pem.includes('PRIVATE KEY')) return { pem, created: false }
  }
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, privateKey, { mode: 0o600 })
  return { pem: privateKey.trim(), created: true }
}
