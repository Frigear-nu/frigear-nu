import { getQuery, sendRedirect } from 'h3'

// The fake frigear.nu signs the browser in at once and sends it back to the client's redirect URI with a code.
export default defineEventHandler((event) => {
  const query = getQuery(event) as Record<string, string>
  if (query.code_challenge_method !== 'S256' || !query.code_challenge) {
    throw createError({ statusCode: 400, statusMessage: 'PKCE (S256) is required.' })
  }
  const code = `code-${crypto.randomUUID()}`
  fakeIssuerCodes.set(code, { clientId: query.client_id!, redirectUri: query.redirect_uri!, challenge: query.code_challenge, nonce: query.nonce! })
  const target = new URL(query.redirect_uri!)
  target.searchParams.set('code', code)
  target.searchParams.set('state', query.state!)
  return sendRedirect(event, target.toString())
})
