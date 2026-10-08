import type { H3Event } from 'h3'

export function useOAuthConfig() {
  return useRuntimeConfig().oauthServer
}

/** The configured issuer, or the origin the request came in on (honouring `x-forwarded-*`). */
export function getOAuthIssuer(event: H3Event): string {
  const configured = useOAuthConfig().issuer
  const issuer = configured || getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return issuer.replace(/\/+$/, '')
}

/** Scopes this server accepts: the defaults plus whatever the host configured. */
export function getSupportedScopes(): string[] {
  return [...new Set(['openid', 'profile', 'email', ...useOAuthConfig().scopes])]
}

/** The signed-in user's numeric id (the `users` table uses integer ids). Responds 401 when nobody is signed in. */
export async function requireSessionUserId(event: H3Event): Promise<number> {
  const { user } = await requireUserSession(event)
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
