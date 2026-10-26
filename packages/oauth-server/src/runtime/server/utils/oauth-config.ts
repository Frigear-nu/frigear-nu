import type { H3Event } from 'h3'
import { scopes as apiScopes } from '#auth/scopes'

export function useOAuthConfig() {
  return useRuntimeConfig().oauthServer
}

/** Origins allowed to call the token, revocation, userinfo and discovery endpoints from a browser. Never `*`. */
export function getOAuthCorsOrigins(): string[] {
  const configured = useOAuthConfig().corsOrigins
  const list = Array.isArray(configured) ? configured : String(configured ?? '').split(',')
  return list.map(origin => origin.trim()).filter(origin => origin && origin !== '*')
}

/** The configured issuer, or the origin the request came in on (honouring `x-forwarded-*`). */
export function getOAuthIssuer(event: H3Event): string {
  const configured = useOAuthConfig().issuer
  const issuer = configured || getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return issuer.replace(/\/+$/, '')
}

/**
 * Scopes this server accepts: the OIDC defaults, whatever the host configured, and the API scopes
 * modules register with `@frigear-nu/auth` (what an access token may do against the API).
 */
export function getSupportedScopes(): string[] {
  return [...new Set(['openid', 'profile', 'email', ...useOAuthConfig().scopes, ...apiScopes.map(scope => scope.name)])]
}

/** The signed-in user's numeric id (the `users` table uses integer ids). Responds 401 when nobody is signed in. */
export async function requireSessionUserId(event: H3Event): Promise<number> {
  const user = await requireUser(event, { sessionOnly: true })
  return Number((user as { id: number | string }).id)
}

/**
 * OAuth style error body (RFC 6749 §5.2). Return it from a handler:
 * `return oauthError(event, 400, 'invalid_grant', 'The code expired.')`.
 */
export function oauthError(event: H3Event, statusCode: number, error: string, description?: string) {
  setResponseStatus(event, statusCode)
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { error, ...(description ? { error_description: description } : {}) }
}
