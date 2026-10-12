import type { H3Event } from 'h3'
import type { AuthPrincipal } from '@frigear-nu/auth/utils'
import { parseScopeString } from '@frigear-nu/auth/utils'
import loadUser from '#auth/user-loader'

/**
 * Lets an application call the API as the user who signed in to it: resolves an OAuth access
 * token (`at+jwt`) into a principal carrying the application (`client_id`) and the granted scopes.
 *
 * The token's audience is the application, so it is deliberately not matched against this server:
 * the application is the one holding the token. Everything else is re-checked on every request
 * (the application is still active, the user still exists and may still use it), so disabling an
 * application or removing a role takes effect immediately instead of when the token expires.
 */
export default async function resolveAccessToken(event: H3Event, token: string): Promise<AuthPrincipal | null> {
  const payload = await verifyAccessToken(event, token)
  if (!payload) return null

  const [application, oauthUser] = await Promise.all([
    getApplication(payload.client_id),
    getOAuthUser(Number(payload.sub)),
  ])
  if (!application || !oauthUser) return null
  if (!(await checkApplicationAccess(oauthUser, application, event)).allowed) return null

  const user = await loadUser(String(oauthUser.id))
  if (!user) return null

  return { kind: 'oauth', user, scopes: parseScopeString(payload.scope), client: { id: application.id } }
}
