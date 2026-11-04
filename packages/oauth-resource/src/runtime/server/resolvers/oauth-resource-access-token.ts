import type { H3Event } from 'h3'
import type { AuthPrincipal } from '@frigear-nu/auth/utils'
import { parseScopeString } from '@frigear-nu/auth/utils'

/**
 * Accepts access tokens from the configured issuer (`at+jwt` for the shared audience): the caller is the user `sub` names,
 * calling through the application in `client_id`, with the granted `scope`. Routes check the scopes they need with
 * `requireAuth(event, { scopes })` (403 `insufficient_scope`). Tokens of another issuer are left to other resolvers.
 */
export default async function resolveOAuthResourceAccessToken(_event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const payload = await verifyOAuthResourceToken(token)
  if (!payload) return null

  const user = await resolveOAuthResourceUser(token, payload)
  if (!user) return null

  return { kind: 'oauth', user, scopes: parseScopeString(payload.scope ?? ''), client: { id: payload.client_id } }
}
