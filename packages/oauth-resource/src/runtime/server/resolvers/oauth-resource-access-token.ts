import type { H3Event } from 'h3'
import type { AuthPrincipal } from '@frigear-nu/auth/utils'
import { parseScopeString } from '@frigear-nu/auth/utils'

/**
 * Accepts access tokens from the configured issuer (`at+jwt` for the shared audience): the caller is the user `sub` names,
 * calling through the application in `client_id`, with the granted `scope`. The token is foreign: what it may do are
 * its `permissions` (the issuer's claim, or its introspection answer), not this service's roles for the user. Routes
 * check them with `authorize(event, permission)` (403 `insufficient_scope`). Tokens of another issuer are left to other
 * resolvers.
 */
export default async function resolveOAuthResourceAccessToken(_event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const payload = await verifyOAuthResourceToken(token)
  if (!payload) return null

  const scopes = parseScopeString(payload.scope ?? '')
  const permissions = await resolveOAuthResourcePermissions(token, payload, scopes)
  if (!permissions) return null

  const user = await resolveOAuthResourceUser(token, payload)
  if (!user) return null

  return { kind: 'oauth', user, scopes, permissions, foreign: true, client: { id: payload.client_id } }
}
