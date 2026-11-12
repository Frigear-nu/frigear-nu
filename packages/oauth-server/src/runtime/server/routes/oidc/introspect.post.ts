import { z } from 'zod'
import type { OAuthIntrospectionDto } from '../../../../types'

const param = z.string().max(4096).optional()

/** RFC 7662 §2.1, form encoded (JSON accepted too). */
const bodySchema = z.object({
  token: param,
  token_type_hint: param,
  client_id: param,
  client_secret: param,
})

const inactive = (): OAuthIntrospectionDto => ({ active: false })

// RFC 7662 token introspection of access tokens. The caller authenticates as a confidential client and only learns about tokens
// issued to it or for its audience (its `client_id` in `aud`): for anything else, invalid, expired or refresh tokens
// the answer is `{ active: false }`. `permissions` are live: the token's frozen permissions the user may still delegate.
export default defineEventHandler(async (event): Promise<OAuthIntrospectionDto | ReturnType<typeof oauthError>> => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  let body: z.infer<typeof bodySchema>
  try {
    body = await readValidatedBody(event, bodySchema.parse)
  }
  catch (error) {
    return oauthError(event, 400, 'invalid_request', invalidRequestDescription(error))
  }
  const client = await authenticateClient(event, body)
  // A public client proves nothing with its `client_id`: introspection is for clients holding a secret.
  if (!('row' in client) || client.row.clientType !== 'confidential') {
    if ('basic' in client && client.basic) setResponseHeader(event, 'WWW-Authenticate', 'Basic')
    return oauthError(event, 401, 'invalid_client', 'Client authentication failed.')
  }
  if (!body.token) return oauthError(event, 400, 'invalid_request', 'token is required.')

  const payload = await verifyAccessToken(event, body.token)
  if (!payload) return inactive()
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (payload.client_id !== client.row.id && !audience.includes(client.row.id)) return inactive()

  // Live: the application still active and the user still allowed to use it, as for API calls with the token.
  const [application, oauthUser] = await Promise.all([getApplication(payload.client_id), getOAuthUser(Number(payload.sub))])
  if (!application || !oauthUser || !(await checkApplicationAccess(oauthUser, application, event)).allowed) return inactive()
  const user = await loadAuthUser(oauthUser.id)
  if (!user) return inactive()

  const scope = payload.scope.split(' ').filter(Boolean)
  const frozen = Array.isArray(payload.permissions) ? payload.permissions : await grantedOAuthPermissions(event, user, scope)
  const permissions = frozen.length ? await grantedScopePermissions(event, frozen, user) : []
  return {
    active: true,
    scope: payload.scope,
    client_id: payload.client_id,
    sub: payload.sub,
    exp: payload.exp,
    iat: payload.iat,
    iss: payload.iss,
    aud: payload.aud,
    token_type: 'Bearer',
    permissions,
  }
})
