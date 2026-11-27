// Google auth with WebCrypto only (Workers safe, no SDK): a service account's signed JWT (RS256) for an access token
// with domain-wide delegation, and the verification of the OIDC token Pub/Sub puts on a push request. Pure functions;
// the keys and the clock are passed in, so they are unit tested without a network.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Bytes or text as base64url without padding. */
export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url (or base64) as bytes; `null` when it is not valid. */
export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const normal = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
    const binary = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4))
    return Uint8Array.from(binary, char => char.charCodeAt(0))
  }
  catch {
    return null
  }
}

/**
 * The DER bytes of a PEM `PRIVATE KEY` (PKCS #8, as in a service account's JSON key). Escaped line breaks (`\n` as two
 * characters, as an environment variable often carries them) are accepted.
 */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
  const bytes = base64UrlDecode(body)
  if (!bytes?.length) throw new Error('The private key is not a PEM PKCS #8 key (-----BEGIN PRIVATE KEY-----).')
  return bytes
}

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const

/** The scope the inbox reads Gmail with. */
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
/** Google's OAuth token endpoint (the audience of a service account's assertion). */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/**
 * A service account's signed assertion (RFC 7523) for `GOOGLE_TOKEN_URL`: issued by `clientEmail`, for `subject` (the
 * Workspace user it acts as, with domain-wide delegation), with `scope`, valid for an hour from `now` (milliseconds).
 */
export async function signServiceAccountJwt(input: { clientEmail: string, privateKey: string, subject: string, scope: string, now?: number, audience?: string }): Promise<string> {
  const iat = Math.floor((input.now ?? Date.now()) / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64UrlEncode(JSON.stringify({ iss: input.clientEmail, sub: input.subject, scope: input.scope, aud: input.audience ?? GOOGLE_TOKEN_URL, iat, exp: iat + 3600 }))
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(input.privateKey), RS256, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign(RS256, key, encoder.encode(`${header}.${claims}`)))
  return `${header}.${claims}.${base64UrlEncode(signature)}`
}

/** A JSON Web Key of Google's OIDC certificates (`https://www.googleapis.com/oauth2/v3/certs`). */
export type GoogleJwk = JsonWebKey & { kid?: string }

/** The claims of a Pub/Sub push OIDC token the inbox checks. */
export type GoogleOidcClaims = { iss: string, aud: string, exp: number, iat?: number, email?: string, email_verified?: boolean, sub?: string }

/** The issuers of Google's ID tokens. */
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

/**
 * Verifies a Google-signed OIDC token, as Pub/Sub puts it on a push request (`Authorization: Bearer <token>`): an RS256
 * signature by one of `keys` (by `kid`), Google as the issuer, `audience` as the audience, not expired at `now` (five
 * minutes of clock skew), and, when `email` is given, issued for that service account with a verified email. Answers
 * the claims, or `null` for anything else. An empty audience never verifies.
 */
export async function verifyGoogleOidcToken(token: string | null | undefined, options: { audience: string, email?: string, keys: readonly GoogleJwk[], now?: number }): Promise<GoogleOidcClaims | null> {
  if (!token || !options.audience) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [rawHeader, rawClaims, rawSignature] = parts as [string, string, string]
  let header: { alg?: string, kid?: string }
  let claims: GoogleOidcClaims
  try {
    header = JSON.parse(decoder.decode(base64UrlDecode(rawHeader) ?? new Uint8Array()))
    claims = JSON.parse(decoder.decode(base64UrlDecode(rawClaims) ?? new Uint8Array()))
  }
  catch {
    return null
  }
  if (header.alg !== 'RS256') return null
  const jwk = options.keys.find(key => key.kid === header.kid && key.kty === 'RSA')
  const signature = base64UrlDecode(rawSignature)
  if (!jwk || !signature) return null
  let valid: boolean
  try {
    const { kid: _kid, alg: _alg, use: _use, ...material } = jwk as GoogleJwk & { use?: string }
    const key = await crypto.subtle.importKey('jwk', { ...material, alg: 'RS256', ext: true }, RS256, false, ['verify'])
    valid = await crypto.subtle.verify(RS256, key, signature, encoder.encode(`${rawHeader}.${rawClaims}`))
  }
  catch {
    return null
  }
  if (!valid) return null
  const now = Math.floor((options.now ?? Date.now()) / 1000)
  if (!GOOGLE_ISSUERS.includes(claims.iss)) return null
  if (claims.aud !== options.audience) return null
  if (typeof claims.exp !== 'number' || claims.exp + 300 < now) return null
  if (typeof claims.iat === 'number' && claims.iat - 300 > now) return null
  if (options.email && (claims.email?.toLowerCase() !== options.email.toLowerCase() || claims.email_verified !== true)) return null
  return claims
}
