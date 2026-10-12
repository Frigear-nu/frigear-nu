import { SignJWT, importPKCS8 } from 'jose'

const TTL_SECONDS = 60

type IdCodeConfig = { privateKey?: string, keyId?: string, issuer?: string }

function normalizePem(raw: string) {
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim()
}

// Signs with the RS256 key of `@frigear-nu/oauth-server` (so the code can be verified against its published JWKS),
// unless `runtimeConfig.account.idCode` overrides it. No hard dependency: the key is just read from runtime config.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  const config = useRuntimeConfig(event) as {
    account?: { idCode?: IdCodeConfig }
    oauthServer?: IdCodeConfig
  }
  const own = config.account?.idCode
  const oauth = config.oauthServer
  const pem = normalizePem(own?.privateKey || oauth?.privateKey || '')
  if (!pem) {
    throw createError({ statusCode: 501, statusMessage: 'Frigear ID is not configured: set a signing key.' })
  }
  const keyId = own?.keyId || oauth?.keyId || 'key-1'
  const issuer = own?.issuer || oauth?.issuer || getRequestURL(event).origin

  const key = await importPKCS8(pem, 'RS256')
  const jwt = await new SignJWT({ typ: 'frigear:id' })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(issuer)
    .setSubject(String(user.id))
    .setAudience('frigear:id')
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(key)

  return { idCode: jwt, payload: `urn:frigear:id:${jwt}`, expiresIn: TTL_SECONDS }
})
