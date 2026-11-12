import type { NuxtApp } from '#app'
import { $fetch } from '#imports'
import type { AccessDto } from '../../../utils/permissions'
import { loadIssuerAccess } from '../../utils/access'
import type { IssuerAccessRequest } from '../../utils/access'
import { getAuthClientRuntime, useAuthClientConfig } from './runtime'

/** `$authAccess()`: what the signed-in user may do, for the UI (`useAuthorization()` of `@frigear-nu/authorization`). */
export type AuthClientAccess = () => Promise<AccessDto | null>

/**
 * Asks the issuer's `/api/auth/me/access` with the bearer access token, falling back to the token's `permissions`
 * claim (`loadIssuerAccess`). Called directly with the token rather than through `$api`, so an issuer outside
 * `apiOrigins` still gets it and a refusal never signs the user out. `null` on the server (no tokens there).
 * UI only: the API checks every request itself.
 */
export function createAuthClientAccess(nuxtApp: NuxtApp): AuthClientAccess {
  const config = nuxtApp.runWithContext(() => useAuthClientConfig())
  return async () => {
    if (import.meta.server) return null
    const runtime = await nuxtApp.runWithContext(() => getAuthClientRuntime())
    return loadIssuerAccess({
      client: runtime.client,
      request: $fetch as unknown as IssuerAccessRequest,
      issuer: runtime.rewriteUrl(config.issuer),
    })
  }
}
