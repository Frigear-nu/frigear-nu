import type { H3Event } from 'h3'
import { hasScopes, type RequireUserOptions } from '@frigear-nu/auth/utils'

/**
 * The signed-in user, or a thrown 401/403 (see `requireAuth` for the credential rules: `scopes`, `sessionOnly`).
 * Use `requireAuth` instead when the route only needs to know how the caller authenticated.
 */
export async function requireUser(event: H3Event, options: RequireUserOptions = {}) {
  return (await requireAuth(event, options)).user
}

/**
 * The caller's user when there is one, otherwise `null` (never throws). For routes that are open to everyone but
 * personalise for a signed-in user. A bearer credential missing the required `scopes` counts as anonymous.
 */
export async function getUser(event: H3Event, options: Pick<RequireUserOptions, 'scopes'> = {}) {
  const principal = await getAuth(event)
  if (!principal) return null
  return !options.scopes?.length || hasScopes(principal.scopes, options.scopes) ? principal.user : null
}
