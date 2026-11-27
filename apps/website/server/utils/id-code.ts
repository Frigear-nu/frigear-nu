import { SignJWT, errors as joseErrors, exportJWK, importJWK, importPKCS8, importSPKI, jwtVerify } from 'jose'
import { apiError, notConfigured } from '@frigear-nu/module-kit/server'

export const ID_CODE_TTL_SECONDS = 60

/** Seconds of clock difference `verifyIdCode` tolerates on `exp`, `iat` and `nbf`. */
export const ID_CODE_CLOCK_TOLERANCE_SECONDS = 5

const ID_CODE_TYPE = 'frigear:id'
const ID_CODE_AUDIENCE = 'frigear:id'
const ID_CODE_URN_PREFIX = 'urn:frigear:id:'

export type IdCodeConfig = { privateKey?: string, publicKey?: string, keyId?: string, issuer?: string }

/** The runtime config sections that can carry the signing key. */
export type IdCodeRuntimeConfig = {
  account?: { idCode?: IdCodeConfig }
  oauthServer?: IdCodeConfig
}

function normalizePem(raw: string) {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
}

/** The key, key id and issuer Frigear ID codes use: `account.idCode` when it sets a key, else `oauthServer`'s. */
function idCodeKeyConfig(config: IdCodeRuntimeConfig, fallbackIssuer: string) {
  const own = config.account?.idCode
  const oauth = config.oauthServer
  // The public key belongs to whichever private key is used, so it is taken from the same section.
  const section = own?.privateKey ? own : oauth
  return {
    privatePem: normalizePem(section?.privateKey || ''),
    publicPem: normalizePem(section?.publicKey || ''),
    keyId: own?.keyId || oauth?.keyId || 'key-1',
    issuer: own?.issuer || oauth?.issuer || fallbackIssuer,
  }
}

/**
 * Signs a short-lived Frigear ID code for `userId` with the RS256 key of `@frigear-nu/oauth-server` (so the code can
 * be verified against its published JWKS), unless `runtimeConfig.account.idCode` overrides it. Throws 501
 * `not_configured` when no key is set.
 */
export async function signIdCode(config: IdCodeRuntimeConfig, userId: string | number, fallbackIssuer: string) {
  const { privatePem, keyId, issuer } = idCodeKeyConfig(config, fallbackIssuer)
  if (!privatePem) throw notConfigured('Frigear ID is not configured: set a signing key.')

  const key = await importPKCS8(privatePem, 'RS256')
  const jwt = await new SignJWT({ typ: ID_CODE_TYPE })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(issuer)
    .setSubject(String(userId))
    .setAudience(ID_CODE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ID_CODE_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(key)

  return { idCode: jwt, payload: `${ID_CODE_URN_PREFIX}${jwt}`, expiresIn: ID_CODE_TTL_SECONDS }
}

/** The public key that verifies the codes `signIdCode` signs: the configured public key, or derived from the private one. */
async function idCodePublicKey(privatePem: string, publicPem: string) {
  if (publicPem) return importSPKI(publicPem, 'RS256')
  const { kty, n, e } = await exportJWK(await importPKCS8(privatePem, 'RS256', { extractable: true }))
  return importJWK({ kty, n, e }, 'RS256')
}

/** What a verified Frigear ID code says. */
export type VerifiedIdCode = { userId: string, codeId: string | null, issuedAt: number | null, expiresAt: number }

const invalidCode = () => apiError(400, 'invalid_code', 'This is not a valid Frigear ID.')

/**
 * Verifies a Frigear ID code (`urn:frigear:id:<jwt>` or the bare JWT) with the public half of the key `signIdCode`
 * uses: RS256 only, the issuer, audience `frigear:id`, claim `typ: frigear:id`, a subject, and `exp` with
 * `ID_CODE_CLOCK_TOLERANCE_SECONDS` of tolerance. Throws 400 `invalid_code` for anything malformed, signed by another
 * key or not a Frigear ID, 410 `expired` for a code past its expiry, and 501 `not_configured` without a key.
 */
export async function verifyIdCode(config: IdCodeRuntimeConfig, code: string, fallbackIssuer: string, options: { currentDate?: Date } = {}): Promise<VerifiedIdCode> {
  const { privatePem, publicPem, issuer } = idCodeKeyConfig(config, fallbackIssuer)
  if (!privatePem && !publicPem) throw notConfigured('Frigear ID is not configured: set a signing key.')

  const trimmed = code.trim()
  const jwt = trimmed.startsWith(ID_CODE_URN_PREFIX) ? trimmed.slice(ID_CODE_URN_PREFIX.length) : trimmed
  if (!jwt || jwt.split('.').length !== 3) throw invalidCode()

  const key = await idCodePublicKey(privatePem, publicPem)
  try {
    const { payload } = await jwtVerify(jwt, key, {
      algorithms: ['RS256'],
      issuer,
      audience: ID_CODE_AUDIENCE,
      requiredClaims: ['exp', 'sub'],
      clockTolerance: ID_CODE_CLOCK_TOLERANCE_SECONDS,
      currentDate: options.currentDate,
    })
    if (payload.typ !== ID_CODE_TYPE || !payload.sub) throw invalidCode()
    return { userId: payload.sub, codeId: payload.jti ?? null, issuedAt: payload.iat ?? null, expiresAt: payload.exp! }
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) throw apiError(410, 'expired', 'This Frigear ID has expired. Ask for a new one.')
    if (error instanceof joseErrors.JOSEError) throw invalidCode()
    throw error
  }
}
