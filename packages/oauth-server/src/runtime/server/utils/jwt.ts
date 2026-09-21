import type { Users } from '@nuxthub/db/schema'

const ROLE_CLAIM = 'https://frigear.nu/claims/role'
interface JWTPayload {
  sub: string
  iss: string
  aud: string | string[]
  exp: number
  iat: number
  scope?: string
  name?: string
  email?: string
  role?: Users['role']
  picture?: string
  [claim: string]: unknown
  [ROLE_CLAIM]: Users['role']
}

interface JWK {
  kty: string
  n: string
  e: string
  alg: string
  use: string
  kid: string
}

export function normalizePemKey(pem: string): string {
  return pem
    .replace(/^["']|["']$/g, '') // strip surrounding quotes
    .replace(/\\n/g, '\n') // literal \n → real newlines
    .trim()
}

// Helper to convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Helper to convert base64url to ArrayBuffer
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(base64 + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// Convert PEM to ArrayBuffer
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/^["']|["']$/g, '') // strip surrounding quotes
    .replace(/\\n/g, '\n') // convert literal \n to real newlines
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')

  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}
// function pemToArrayBuffer(pem: string): ArrayBuffer {
//   const base64 = pem
//     .replace(/-----BEGIN [^-]+-----/g, '')
//     .replace(/-----END [^-]+-----/g, '')
//     .replace(/\s+/g, '') // strip all whitespace including newlines
//   const binary = atob(base64) // atob handles standard base64 directly
//   const bytes = new Uint8Array(binary.length)
//   for (let i = 0; i < binary.length; i++) {
//     bytes[i] = binary.charCodeAt(i)
//   }
//   return bytes.buffer
// }
// function pemToArrayBuffer(pem: string): ArrayBuffer {
//   const base64 = pem
//     .replace(/-----BEGIN [^-]+-----/g, '')
//     .replace(/-----END [^-]+-----/g, '')
//     .replace(/[^a-z0-9+/=]/gi, '')
//   return base64UrlToArrayBuffer(base64.replace(/\+/g, '-').replace(/\//g, '_'))
// }

// Import RSA private key from PEM
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem)
  return crypto.subtle.importKey(
    'pkcs8',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['sign'],
  )
}

// Import RSA public key from PEM
async function importPublicKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem)
  return crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    true,
    ['verify'],
  )
}

// Generate a signed JWT
async function generateJWT(
  payload: Omit<JWTPayload, 'iat'>,
  privateKeyPem: string,
): Promise<string> {
  const privateKey = await importPrivateKey(privateKeyPem)

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'key-1',
  }

  const fullPayload: JWTPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
  } as JWTPayload

  const encodedHeader = arrayBufferToBase64Url(
    new TextEncoder().encode(JSON.stringify(header)).buffer,
  )
  const encodedPayload = arrayBufferToBase64Url(
    new TextEncoder().encode(JSON.stringify(fullPayload)).buffer,
  )

  const signatureInput = `${encodedHeader}.${encodedPayload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signatureInput),
  )

  const encodedSignature = arrayBufferToBase64Url(signature)
  return `${signatureInput}.${encodedSignature}`
}

// Verify and decode a JWT
export async function verifyJWT(
  token: string,
  publicKeyPem: string,
  options?: { issuer?: string, audience?: string },
): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string]

    const publicKey = await importPublicKey(publicKeyPem)

    const signatureInput = `${encodedHeader}.${encodedPayload}`
    const signature = base64UrlToArrayBuffer(encodedSignature)

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      new TextEncoder().encode(signatureInput),
    )

    if (!valid) return null

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToArrayBuffer(encodedPayload)),
    ) as JWTPayload

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    // Validate issuer
    if (options?.issuer && payload.iss !== options.issuer) {
      return null
    }

    // Validate audience
    if (options?.audience) {
      const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
      if (!audiences.includes(options.audience)) {
        return null
      }
    }

    return payload
  }
  catch {
    return null
  }
}

// Generate access token for a user
export async function generateAccessToken(
  user: Users,
  clientId: string,
  scope: string,
  issuer: string,
  privateKeyPem: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  return generateJWT(
    {
      sub: `${user.id}`,
      iss: issuer,
      aud: clientId,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      scope,
      name: user.name,
      email: user.email,
      role: user.role,
      [ROLE_CLAIM]: user.role,
      picture: user.avatarUrl || undefined,
    },
    privateKeyPem,
  )
}

// Generate ID token (OpenID Connect)
export async function generateIdToken(
  user: Users,
  clientId: string,
  issuer: string,
  privateKeyPem: string,
  nonce?: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const payload: Record<string, unknown> = {
    sub: `${user.id}`,
    iss: issuer,
    aud: clientId,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    name: user.name,
    email: user.email,
    picture: user.avatarUrl || undefined,
    role: user.role || 'user',
    [ROLE_CLAIM]: user.role,
  }

  if (nonce) {
    payload.nonce = nonce
  }

  return generateJWT(payload as Omit<JWTPayload, 'iat'>, privateKeyPem)
}

// Export public key as JWK
export async function getJWKS(publicKeyPem: string): Promise<{ keys: JWK[] }> {
  const publicKey = await importPublicKey(publicKeyPem)
  const exported = await crypto.subtle.exportKey('jwk', publicKey)

  return {
    keys: [
      {
        kty: exported.kty || 'RSA',
        n: exported.n || '',
        e: exported.e || '',
        alg: 'RS256',
        use: 'sig',
        kid: 'key-1',
      },
    ],
  }
}
