import { createHash } from 'node:crypto'
import { getRequestURL, readBody } from 'h3'

// The fake frigear.nu token endpoint for a public client: the code once, its redirect URI, and the PKCE verifier of
// its challenge; a client secret is refused.
export default defineEventHandler(async (event) => {
  const body = Object.fromEntries(new URLSearchParams(await readBody<string>(event)))
  fakeIssuerExchanges.push(body)
  const issued = body.code ? fakeIssuerCodes.get(body.code) : undefined
  if (body.code) fakeIssuerCodes.delete(body.code)
  const challenge = createHash('sha256').update(body.code_verifier ?? '').digest('base64url')
  if (body.grant_type !== 'authorization_code' || !issued || body.client_secret || body.client_id !== issued.clientId
    || body.redirect_uri !== issued.redirectUri || challenge !== issued.challenge) {
    setResponseStatus(event, 400)
    return { error: 'invalid_grant' }
  }
  const issuer = fakeIssuerUrl(getRequestURL(event).origin)
  return {
    access_token: 'issuer-access',
    refresh_token: 'issuer-refresh',
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid profile email',
    id_token: await fakeIssuerIdToken(issuer, issued.clientId, issued.nonce),
  }
})
