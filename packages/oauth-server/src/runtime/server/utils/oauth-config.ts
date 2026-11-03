import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import type { OAuthNormalizedClient, OAuthScopeDefinition } from '../../../types'
import { scopes as apiScopes } from '#auth/scopes'
import { normalizeConfiguredClients, parseList } from '../../utils'

export function useOAuthConfig() {
  return useRuntimeConfig().oauthServer
}

/**
 * Origins allowed to call the token, revocation, userinfo and discovery endpoints (and `cors.paths`) from a browser:
 * `cors.origins` plus the origins of the configured clients. Never `*`.
 */
export function getOAuthCorsOrigins(): string[] {
  const origins = [...parseList(useOAuthConfig().corsOrigins), ...getOAuthConfiguredClients().flatMap(client => client.corsOrigins)]
  return [...new Set(origins)].filter(origin => origin !== '*')
}

/** The host API path prefixes open to the CORS origins (`cors.paths`). */
export function getOAuthCorsPaths(): string[] {
  return parseList(useOAuthConfig().corsPaths)
}

let configuredClients: { source: unknown, clients: OAuthNormalizedClient[] } | undefined

/**
 * The clients of `oauthServer.clients` (or `NUXT_OAUTH_SERVER_CLIENTS`), validated. An invalid list is a deployment
 * error: every OAuth request answers 500 `not_configured` until it is fixed.
 */
export function getOAuthConfiguredClients(): OAuthNormalizedClient[] {
  const config = useOAuthConfig()
  const source = config.clients
  if (configuredClients && configuredClients.source === source) return configuredClients.clients
  let clients: OAuthNormalizedClient[]
  try {
    clients = normalizeConfiguredClients(source, { dev: import.meta.dev, callbackPath: config.callbackPath })
  }
  catch (error) {
    console.error(`[oauth-server] oauthServer.clients is invalid: ${(error as Error).message}`)
    throw apiError(500, 'not_configured', 'The configured OAuth clients are invalid.')
  }
  configuredClients = { source, clients }
  return clients
}

/** Whether the application is defined in `oauthServer.clients` (and so managed by config, not the admin UI). */
export function isOAuthConfiguredClient(id: string): boolean {
  return getOAuthConfiguredClients().some(client => client.id === id)
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
