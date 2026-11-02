import type { H3Event } from 'h3'
import type { OAuthScopeDefinition } from '../../../types'
import { scopes as apiScopes } from '#auth/scopes'
import { parseList } from '../../utils'

export function useOAuthConfig() {
  return useRuntimeConfig().oauthServer
}

/** Origins allowed to call the token, revocation, userinfo and discovery endpoints from a browser. Never `*`. */
export function getOAuthCorsOrigins(): string[] {
  return parseList(useOAuthConfig().corsOrigins).filter(origin => origin !== '*')
}

/** The `aud` of access tokens: the configured shared audience, or `undefined` for the application's `client_id`. */
export function getAccessTokenAudience(): string | string[] | undefined {
  const audience = parseList(useOAuthConfig().accessTokenAudience)
  return audience.length > 1 ? audience : audience[0]
}

/** The scope registry: every scope the host configured or a module added with `addOAuthScope`. */
export function getOAuthScopeRegistry(): OAuthScopeDefinition[] {
  return useOAuthConfig().scopeDetails ?? []
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

/**
 * How to present each scope on the consent screen: the details the host configured, else the description the scope
 * was registered with through `@frigear-nu/auth` (as its label). Scopes nobody described are just their name.
 */
export function getOAuthScopeDetails(scope: string[]): OAuthScopeDefinition[] {
  const configured = new Map(getOAuthScopeRegistry().map(details => [details.name, details]))
  const registered = new Map(apiScopes.map(definition => [definition.name, definition.description]))
  return scope.map((name) => {
    // The consent screen needs no staff flag: a scope the user may not hold never reaches it.
    const { staffOnly: _staffOnly, ...details } = configured.get(name) ?? { name }
    const description = registered.get(name)
    if (!details.label && description) details.label = description
    return { ...details, name }
  })
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

/**
 * The `error_description` for a token or revocation request whose body failed `readValidatedBody` (h3's 400 with the
 * zod issues in `data`, or unparsable JSON), so the route can still answer the RFC 6749 `invalid_request` body.
 */
export function invalidRequestDescription(error: unknown): string {
  const issues = (error as { data?: { issues?: { path?: PropertyKey[], message?: string }[] } })?.data?.issues
  if (!Array.isArray(issues) || !issues.length) return 'The request body is malformed.'
  return `Invalid request: ${issues.map(issue => [issue.path?.map(String).join('.'), issue.message].filter(Boolean).join(' ')).join(', ')}`
}
