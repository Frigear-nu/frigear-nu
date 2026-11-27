import { beforeAll, describe, expect, it } from 'vitest'
import { base64UrlDecode, base64UrlEncode, GOOGLE_TOKEN_URL, signServiceAccountJwt, verifyGoogleOidcToken } from '../../src/runtime/utils/google'
import type { GoogleJwk } from '../../src/runtime/utils/google'

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const
const AUDIENCE = 'https://inbox.example.org/api/inbox/email/gmail'
const PUSHER = 'pubsub-push@project.iam.gserviceaccount.com'
const NOW = Date.UTC(2026, 10, 26, 12, 0, 0)

let keys: CryptoKeyPair
let jwk: GoogleJwk
let otherKeys: CryptoKeyPair

async function generate(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey({ ...RS256, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']) as CryptoKeyPair
}

/** A token as Google signs it for a Pub/Sub push. */
async function token(claims: Record<string, unknown>, options: { key?: CryptoKey, kid?: string, alg?: string } = {}): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'key-1', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(claims))
  const signature = new Uint8Array(await crypto.subtle.sign(RS256, options.key ?? keys.privateKey, new TextEncoder().encode(`${header}.${body}`)))
  return `${header}.${body}.${base64UrlEncode(signature)}`
}

const valid = () => ({ iss: 'https://accounts.google.com', aud: AUDIENCE, iat: NOW / 1000 - 10, exp: NOW / 1000 + 3600, email: PUSHER, email_verified: true, sub: '123' })

beforeAll(async () => {
  keys = await generate()
  otherKeys = await generate()
  jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' } as GoogleJwk
})

describe('verifyGoogleOidcToken', () => {
  const verify = (value: string | undefined, overrides: { audience?: string, email?: string, keys?: GoogleJwk[], now?: number } = {}) =>
    verifyGoogleOidcToken(value, { audience: AUDIENCE, email: PUSHER, keys: [jwk], now: NOW, ...overrides })

  it('accepts a token Google signed for the audience and the push service account', async () => {
    expect(await verify(await token(valid()))).toMatchObject({ aud: AUDIENCE, email: PUSHER })
    expect(await verify(await token({ ...valid(), iss: 'accounts.google.com' }))).not.toBeNull()
    // Without an expected email, any Google-signed token for the audience.
    expect(await verify(await token({ ...valid(), email: 'other@x.iam.gserviceaccount.com' }), { email: undefined })).not.toBeNull()
  })
  it('refuses another audience, issuer, sender or an unverified email', async () => {
    expect(await verify(await token({ ...valid(), aud: 'https://evil.test' }))).toBeNull()
    expect(await verify(await token({ ...valid(), iss: 'https://evil.test' }))).toBeNull()
    expect(await verify(await token({ ...valid(), email: 'other@x.iam.gserviceaccount.com' }))).toBeNull()
    expect(await verify(await token({ ...valid(), email_verified: false }))).toBeNull()
    expect(await verify(await token(valid()), { audience: '' })).toBeNull()
  })
  it('refuses an expired token and one from the future, with five minutes of skew', async () => {
    expect(await verify(await token({ ...valid(), exp: NOW / 1000 - 301 }))).toBeNull()
    expect(await verify(await token({ ...valid(), exp: NOW / 1000 - 200 }))).not.toBeNull()
    expect(await verify(await token({ ...valid(), iat: NOW / 1000 + 600 }))).toBeNull()
  })
  it('refuses another key, an unknown kid, another algorithm, a tampered body and garbage', async () => {
    expect(await verify(await token(valid(), { key: otherKeys.privateKey }))).toBeNull()
    expect(await verify(await token(valid(), { kid: 'key-2' }))).toBeNull()
    expect(await verify(await token(valid(), { alg: 'HS256' }))).toBeNull()
    const [header, , signature] = (await token(valid())).split('.')
    expect(await verify(`${header}.${base64UrlEncode(JSON.stringify({ ...valid(), aud: 'x' }))}.${signature}`)).toBeNull()
    expect(await verify('not-a-token')).toBeNull()
    expect(await verify(undefined)).toBeNull()
    expect(await verify(await token(valid()), { keys: [] })).toBeNull()
  })
})

describe('signServiceAccountJwt', () => {
  it('signs an assertion for the token endpoint, as the Workspace user, that the public key verifies', async () => {
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/.{64}/g, '$&\n')}\n-----END PRIVATE KEY-----\n`
    // As an environment variable carries it: escaped line breaks.
    const jwt = await signServiceAccountJwt({ clientEmail: 'inbox@p.iam.gserviceaccount.com', privateKey: pem.replace(/\n/g, '\\n'), subject: 'support@example.org', scope: 'https://www.googleapis.com/auth/gmail.readonly', now: NOW })
    const [header, body, signature] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(header)!))).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(body)!))).toEqual({
      iss: 'inbox@p.iam.gserviceaccount.com',
      sub: 'support@example.org',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      aud: GOOGLE_TOKEN_URL,
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    })
    expect(await crypto.subtle.verify(RS256, keys.publicKey, base64UrlDecode(signature)!, new TextEncoder().encode(`${header}.${body}`))).toBe(true)
  })
  it('refuses a key that is not PEM', async () => {
    await expect(signServiceAccountJwt({ clientEmail: 'a', privateKey: '', subject: 'b', scope: 'c' })).rejects.toThrow('PKCS #8')
  })
})
