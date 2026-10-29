import { SignJWT, importPKCS8 } from 'jose'
import { notConfigured } from '@frigear-nu/module-kit/server'

export const ID_CODE_TTL_SECONDS = 60

export type IdCodeConfig = { privateKey?: string, keyId?: string, issuer?: string }

/** The runtime config sections that can carry the signing key. */
export type IdCodeRuntimeConfig = {
  account?: { idCode?: IdCodeConfig }
  oauthServer?: IdCodeConfig
}

function normalizePem(raw: string) {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
}

/**
 * Signs a short-lived Frigear ID code for `userId` with the RS256 key of `@frigear-nu/oauth-server` (so the code can
 * be verified against its published JWKS), unless `runtimeConfig.account.idCode` overrides it. Throws 501
 * `not_configured` when no key is set.
 */
export async function signIdCode(config: IdCodeRuntimeConfig, userId: string | number, fallbackIssuer: string) {
  const own = config.account?.idCode
  const oauth = config.oauthServer
  const pem = normalizePem(own?.privateKey || oauth?.privateKey || '')
  if (!pem) throw notConfigured('Frigear ID is not configured: set a signing key.')

  const keyId = own?.keyId || oauth?.keyId || 'key-1'
  const issuer = own?.issuer || oauth?.issuer || fallbackIssuer

  const key = await importPKCS8(pem, 'RS256')
  const jwt = await new SignJWT({ typ: 'frigear:id' })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(issuer)
    .setSubject(String(userId))
    .setAudience('frigear:id')
    .setIssuedAt()
    .setExpirationTime(`${ID_CODE_TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(key)

  return { idCode: jwt, payload: `urn:frigear:id:${jwt}`, expiresIn: ID_CODE_TTL_SECONDS }
}
