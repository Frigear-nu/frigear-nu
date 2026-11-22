// `@frigear-nu/module-kit/id`: record ids and random tokens, with Web Crypto only, so the same code runs in Node, on
// Cloudflare Workers and in the browser. Also exported from `@frigear-nu/module-kit/server`.
import { bytesToBase64Url, bytesToHex } from './crypto'

/**
 * A random record id: 32 hex characters (a v4 UUID without dashes), after `<prefix>_` when a prefix is given.
 *
 *     newId('opr') // 'opr_3f2c9a...'
 */
export function newId(prefix?: string): string {
  const id = crypto.randomUUID().replaceAll('-', '')
  return prefix ? `${prefix}_${id}` : id
}

/**
 * `bytes` random bytes (32 by default, 256 bits) as unpadded base64url (43 characters for 32 bytes) or lowercase hex
 * (64). For secrets shown once and stored as a hash: API tokens, invite links, client secrets.
 */
export function randomToken(bytes = 32, encoding: 'base64url' | 'hex' = 'base64url'): string {
  const random = crypto.getRandomValues(new Uint8Array(bytes))
  return encoding === 'hex' ? bytesToHex(random) : bytesToBase64Url(random)
}
