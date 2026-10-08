import { readBody } from 'h3'

// Token endpoint: `authorization_code` (PKCE) and `refresh_token` (rotating) grants for confidential clients.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Pragma', 'no-cache')
  const body = (await readBody(event).catch(() => undefined)) as Record<string, unknown> | undefined

  const credentials = readClientCredentials(event, body)
  const row = credentials ? await getApplicationRow(credentials.clientId) : null
  if (!credentials || !row || !(await verifyApplicationSecret(row, credentials.clientSecret))) {
    if (credentials?.basic) setResponseHeader(event, 'WWW-Authenticate', 'Basic')
    return oauthError(event, 401, 'invalid_client', 'Client authentication failed.')
  }
  const application = toApplication(row)
  const grantType = body?.grant_type

  let grant
  let refreshToken: string
  if (grantType === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body as Record<string, unknown>
    if (typeof code !== 'string' || typeof redirectUri !== 'string' || typeof codeVerifier !== 'string') {
      return oauthError(event, 400, 'invalid_request', 'code, redirect_uri and code_verifier are required.')
    }
    const result = await exchangeAuthorizationCode({ code, application, redirectUri, codeVerifier })
    if ('error' in result) return oauthError(event, 400, 'invalid_grant', result.error)
    grant = result.grant
    refreshToken = (await createRefreshToken({ applicationId: application.id, ...grant })).token
  }
  else if (grantType === 'refresh_token') {
    if (typeof body?.refresh_token !== 'string') return oauthError(event, 400, 'invalid_request', 'refresh_token is required.')
    const result = await rotateRefreshToken({ token: body.refresh_token, application })
    if ('error' in result) return oauthError(event, 400, 'invalid_grant', result.error)
    grant = result.grant
    refreshToken = result.token
  }
  else {
    return oauthError(event, 400, 'unsupported_grant_type', 'Supported grants: authorization_code, refresh_token.')
  }

  // Access is re-checked on every exchange, so disabling an application or removing a role also stops refreshes.
  const user = await getOAuthUser(grant.userId)
  if (!user) return oauthError(event, 400, 'invalid_grant', 'The user no longer exists.')
  const access = await checkApplicationAccess(user, application, event)
  if (!access.allowed) return oauthError(event, 400, 'access_denied', access.reason)

  const input = { event, user, application, scope: grant.scope, roles: access.roles }
  const response: Record<string, unknown> = {
    access_token: await signAccessToken(input),
    token_type: 'Bearer',
    expires_in: useOAuthConfig().accessTokenTtl,
    refresh_token: refreshToken,
    scope: grant.scope.join(' '),
  }
  if (grant.scope.includes('openid')) {
    response.id_token = await signIdToken({ ...input, nonce: grant.nonce, authTime: grant.authTime })
  }

  await useNitroApp().hooks.callHook('oauth:token:issued', {
    userId: user.id,
    applicationId: application.id,
    scope: grant.scope,
    grant: grantType as 'authorization_code' | 'refresh_token',
  })
  return response
})
