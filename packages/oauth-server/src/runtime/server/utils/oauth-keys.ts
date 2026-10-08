import { exportJWK, importPKCS8, importSPKI } from 'jose'
import type { CryptoKey, JWK } from 'jose'

/** Accepts PEMs pasted into env files: strips wrapping quotes and turns literal `\n` into newlines. */
export function normalizePemKey(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
}

const notConfigured = () => createError({ statusCode: 500, statusMessage: 'The OAuth server signing keys are not configured.' })

let cache: { pem: string, publicPem: string, privateKey: CryptoKey, publicJwk: JWK } | undefined

async function loadKeys() {
  const config = useOAuthConfig()
  const pem = config.privateKey ? normalizePemKey(config.privateKey) : ''
  if (!pem) throw notConfigured()
  const publicPem = config.publicKey ? normalizePemKey(config.publicKey) : ''
  if (cache?.pem === pem && cache.publicPem === publicPem) return cache

  const privateKey = await importPKCS8(pem, 'RS256', { extractable: true })
  let publicJwk: JWK
  if (publicPem) {
    publicJwk = await exportJWK(await importSPKI(publicPem, 'RS256', { extractable: true }))
  }
  else {
    // Derive the public half from the private key, so `publicKey` only has to be set to override it.
    const { kty, n, e } = await exportJWK(privateKey)
    publicJwk = { kty, n, e }
  }
  cache = { pem, publicPem, privateKey, publicJwk }
  return cache
}

export async function getSigningKey() {
  return (await loadKeys()).privateKey
}

function parsePreviousKeys(): Record<string, string> {
  const raw = useOAuthConfig().previousPublicKeys
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Object.fromEntries(Object.entries(parsed as Record<string, string>).map(([kid, pem]) => [kid, normalizePemKey(String(pem))]))
  }
  catch {
    throw createError({ statusCode: 500, statusMessage: 'The OAuth server previous public keys are not valid JSON.' })
  }
}

let previousCache: { source: string, jwks: JWK[] } | undefined

async function loadPreviousJwks(): Promise<JWK[]> {
  const keys = parsePreviousKeys()
  const source = JSON.stringify(keys)
  if (previousCache?.source === source) return previousCache.jwks
  const jwks: JWK[] = []
  for (const [kid, pem] of Object.entries(keys)) {
    const { kty, n, e } = await exportJWK(await importSPKI(pem, 'RS256', { extractable: true }))
    jwks.push({ kty, n, e, kid, alg: 'RS256', use: 'sig' })
  }
  previousCache = { source, jwks }
  return jwks
}

/**
 * The JSON Web Key Set served at `/.well-known/jwks.json`: the current key plus the previous public keys
 * that are kept during a rotation. Never contains private key material.
 */
export async function getJwks() {
  const { publicJwk } = await loadKeys()
  const keyId = useOAuthConfig().keyId
  const previous = (await loadPreviousJwks()).filter(jwk => jwk.kid !== keyId)
  return { keys: [{ ...publicJwk, kid: keyId, alg: 'RS256', use: 'sig' }, ...previous] }
}
