import { z } from 'zod'
import { outdatedScopes } from '../../../utils'

const param = z.string().max(4096).optional()

/** RFC 6749 §4.1.3 / §6, form encoded (JSON accepted too). Which fields a grant needs is checked per grant below. */
const bodySchema = z.object({
  grant_type: param,
  code: param,
  redirect_uri: param,
  code_verifier: param,
  refresh_token: param,
  client_id: param,
  client_secret: param,
})

// Token endpoint: `authorization_code` (PKCE) and `refresh_token` (rotating) grants. Confidential clients send their
// secret; public clients (native apps, SPAs) only their `client_id`.
export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Pragma', 'no-cache')
  let body: z.infer<typeof bodySchema>
  try {
    body = await readValidatedBody(event, bodySchema.parse)
  }
  catch (error) {
    // Spec-shaped, not h3's validation error: OAuth clients read `error`.
    return oauthError(event, 400, 'invalid_request', invalidRequestDescription(error))
  }

  const client = await authenticateClient(event, body)
  if (!('row' in client)) {
    if (client.basic) setResponseHeader(event, 'WWW-Authenticate', 'Basic')
    return oauthError(event, 401, 'invalid_client', 'Client authentication failed.')
  }
  const row = client.row
  const application = toApplication(row)
  const grantType = body.grant_type

  let grant
  let refreshToken: string
  let refreshExpiresAt: Date
  if (grantType === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: codeVerifier } = body
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError(event, 400, 'invalid_request', 'code, redirect_uri and code_verifier are required.')
    }
    const result = await exchangeAuthorizationCode({ code, application, redirectUri, codeVerifier })
    if ('error' in result) return oauthError(event, 400, 'invalid_grant', result.error)
    grant = result.grant
    const created = await createRefreshToken({ application, ...grant })
    refreshToken = created.token
    refreshExpiresAt = created.expiresAt
  }
  else if (grantType === 'refresh_token') {
    if (!body.refresh_token) return oauthError(event, 400, 'invalid_request', 'refresh_token is required.')
    const result = await rotateRefreshToken({ token: body.refresh_token, application })
    if ('error' in result) return oauthError(event, 400, 'invalid_grant', result.error)
    grant = result.grant
    refreshToken = result.token
    refreshExpiresAt = result.expiresAt
  }
  else {
    return oauthError(event, 400, 'unsupported_grant_type', 'Supported grants: authorization_code, refresh_token.')
  }

  // Access is re-checked on every exchange, so disabling an application or removing a role also stops refreshes.
  const user = await getOAuthUser(grant.userId)
  if (!user) return oauthError(event, 400, 'invalid_grant', 'The user no longer exists.')
  const access = await checkApplicationAccess(user, application, event)
  if (!access.allowed) return oauthError(event, 400, 'access_denied', access.reason)

  // Scopes are re-checked too, silently (never `invalid_scope` here): a user who lost a permission gets tokens without
  // the scope (the grant keeps it, unused), and a database scope that grew since the consent waits for a new one.
  const authUser = await loadAuthUser(user.id)
  if (!authUser) return oauthError(event, 400, 'invalid_grant', 'The user no longer exists.')
  const { versions } = await getOAuthScopeCatalog(event)
  const outdated = new Set(outdatedScopes(grant.scope, grant.scopeVersions, versions))
  const { granted: scope } = await filterGrantableScopes(event, authUser, grant.scope.filter(name => !outdated.has(name)), { application })
  // Frozen in the access token: what the granted scopes stand for, within what the user may do now.
  const permissions = await grantedOAuthPermissions(event, authUser, scope)
  const input = { event, user, application, scope, roles: access.roles }
  const response: Record<string, unknown> = {
    access_token: await signAccessToken({ ...input, permissions }),
    token_type: 'Bearer',
    expires_in: useOAuthConfig().accessTokenTtl,
    refresh_token: refreshToken,
    // Not in RFC 6749, but common: seconds until the refresh token expires, so a client can warn before a forced sign-in.
    refresh_token_expires_in: Math.max(0, Math.floor((refreshExpiresAt.getTime() - Date.now()) / 1000)),
    scope: scope.join(' '),
  }
  if (scope.includes('openid')) {
    response.id_token = await signIdToken({ ...input, nonce: grant.nonce, authTime: grant.authTime })
  }

  await useNitroApp().hooks.callHook('oauth:token:issued', {
    userId: user.id,
    applicationId: application.id,
    scope,
    grant: grantType as 'authorization_code' | 'refresh_token',
  })
  return response
})
