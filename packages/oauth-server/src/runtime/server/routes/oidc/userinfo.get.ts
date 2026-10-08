export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const header = getHeader(event, 'authorization')
  const token = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  const payload = token ? await verifyAccessToken(event, token) : null
  if (!payload) {
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer error="invalid_token"')
    return oauthError(event, 401, 'invalid_token', 'The access token is missing, invalid or expired.')
  }

  const application = await getApplication(payload.client_id)
  const user = await getOAuthUser(Number(payload.sub))
  if (!application || !user) return oauthError(event, 401, 'invalid_token', 'The access token is no longer valid.')
  const access = await checkApplicationAccess(user, application, event)
  if (!access.allowed) return oauthError(event, 403, 'access_denied', access.reason)

  const scope = payload.scope.split(' ').filter(Boolean)
  const claims = await buildClaims({ user, application, scope, roles: access.roles, tokenType: 'userinfo' })
  return { sub: String(user.id), ...claims }
})
