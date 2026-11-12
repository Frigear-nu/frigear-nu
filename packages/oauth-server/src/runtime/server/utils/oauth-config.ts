import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import type { OAuthNormalizedClient, OAuthScopeDefinition, RefreshTokenPolicy } from '../../../types'
import { registry } from '#auth/permissions'
import type { OAuthScopeCatalog } from './oauth-scopes'
import { configuredClientWarnings, normalizeConfiguredClients, parseList, resolveRefreshTokenOptions } from '../../utils'

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

/** `cors.origins` alone, without the configured clients: the fallback when those cannot be read. */
export function getOAuthStaticCorsOrigins(): string[] {
  return parseList(useOAuthConfig().corsOrigins).filter(origin => origin !== '*')
}

/** The host API path prefixes open to the CORS origins (`cors.paths`). */
export function getOAuthCorsPaths(): string[] {
  return parseList(useOAuthConfig().corsPaths)
}

let refreshPolicy: { source: unknown, policy: RefreshTokenPolicy } | undefined

/**
 * The global refresh-token policy (`refreshToken`, which env may override: `NUXT_OAUTH_SERVER_REFRESH_TOKEN_IDLE_TTL`,
 * `..._MAX_AGE`). An invalid value is a deployment error: 500 `not_configured` until it is fixed.
 */
export function getOAuthRefreshTokenPolicy(): RefreshTokenPolicy {
  const source = useOAuthConfig().refreshToken
  if (!refreshPolicy || refreshPolicy.source !== source) {
    try {
      const value = source as { idleTtl?: number | string, maxAge?: number | string | null } | undefined
      // Env values arrive as strings; an empty one means "not set".
      const maxAge = value?.maxAge === '' ? null : value?.maxAge
      refreshPolicy = { source, policy: resolveRefreshTokenOptions({ refreshToken: { idleTtl: value?.idleTtl as number | undefined, maxAge: maxAge as number | null | undefined } }) }
    }
    catch (error) {
      console.error(`[oauth-server] oauthServer.refreshToken is invalid: ${(error as Error).message}`)
      throw apiError(500, 'not_configured', 'The refresh token policy is invalid.')
    }
  }
  return refreshPolicy.policy
}

let configuredClients: { source: unknown, clients: OAuthNormalizedClient[], error?: Error } | undefined
/** Configured ids that belong to a confidential application in the database: config is ignored for them. */
const conflictingClientIds = new Set<string>()

/**
 * The clients of `oauthServer.clients` (or `NUXT_OAUTH_SERVER_CLIENTS`), validated. An invalid list is a deployment
 * error: every application lookup answers 500 `not_configured` until it is fixed (logged once per value). Ids that
 * turned out to belong to a confidential application are left out.
 */
export function getOAuthConfiguredClients(): OAuthNormalizedClient[] {
  const config = useOAuthConfig()
  const source = config.clients
  if (!configuredClients || configuredClients.source !== source) {
    try {
      configuredClients = { source, clients: normalizeConfiguredClients(source, { dev: import.meta.dev, callbackPath: config.callbackPath }) }
      // Build time warned about the configured list already; this covers a list replaced through env.
      if (typeof source === 'string') {
        for (const warning of configuredClientWarnings(configuredClients.clients, getOAuthRefreshTokenPolicy())) console.warn(`[oauth-server] oauthServer.clients: ${warning}`)
      }
    }
    catch (error) {
      console.error(`[oauth-server] oauthServer.clients is invalid: ${(error as Error).message}`)
      configuredClients = { source, clients: [], error: error as Error }
    }
  }
  if (configuredClients.error) throw apiError(500, 'not_configured', 'The configured OAuth clients are invalid.')
  return conflictingClientIds.size ? configuredClients.clients.filter(client => !conflictingClientIds.has(client.id)) : configuredClients.clients
}

/** Marks a configured id as taken by a confidential application, so config no longer applies to it (see the sync). */
export function excludeOAuthConfiguredClient(id: string): void {
  conflictingClientIds.add(id)
}

/** The configured client with this id, if any. */
export function findOAuthConfiguredClient(id: string): OAuthNormalizedClient | undefined {
  return getOAuthConfiguredClients().find(client => client.id === id)
}

/** Whether the id is defined in `oauthServer.clients`. Managed by config only when its row is public too. */
export function isOAuthConfiguredClient(id: string): boolean {
  return !!findOAuthConfiguredClient(id)
}

/** The `aud` of access tokens: the configured shared audience, or `undefined` for the application's `client_id`. */
export function getAccessTokenAudience(): string | string[] | undefined {
  const audience = parseList(useOAuthConfig().accessTokenAudience)
  return audience.length > 1 ? audience : audience[0]
}

/** How `oauthServer.scopes` presents scopes on the consent screen: named scopes and permission scopes. */
export function getOAuthScopeRegistry(): OAuthScopeDefinition[] {
  return useOAuthConfig().scopeDetails ?? []
}

let warnedIssuer = false

/**
 * The configured issuer, or the origin of the request itself. `x-forwarded-host` / `x-forwarded-proto` are never trusted
 * for it (a client could pick the `iss` and the discovery endpoints), so set `oauthServer.issuer` in production.
 */
export function getOAuthIssuer(event: H3Event): string {
  const configured = useOAuthConfig().issuer
  if (!configured && !import.meta.dev && !warnedIssuer) {
    warnedIssuer = true
    console.warn('[oauth-server] oauthServer.issuer is not set: the issuer is taken from the request URL. Set it (or NUXT_OAUTH_SERVER_ISSUER) to the public origin of this server.')
  }
  const issuer = configured || getRequestURL(event).origin
  return issuer.replace(/\/+$/, '')
}

/**
 * How to present each scope on the consent screen: the details of `oauthServer.scopes`, else the named scope's own
 * (config, module or database scope), else the label or description of the permission it names. Scopes nobody
 * described are just their name.
 */
export function getOAuthScopeDetails(scope: string[], catalog: OAuthScopeCatalog): OAuthScopeDefinition[] {
  const configured = new Map(getOAuthScopeRegistry().map(details => [details.name, details]))
  return scope.map((name) => {
    const named = Object.hasOwn(catalog.named, name) ? catalog.named[name] : undefined
    const permission = Object.hasOwn(registry.permissions, name) ? registry.permissions[name] : undefined
    const base: OAuthScopeDefinition = named
      ? { name, label: named.label, labelKey: named.labelKey, description: named.description, icon: named.icon, service: named.service }
      : { name, label: permission?.label ?? permission?.description, labelKey: permission?.labelKey }
    const { permissions: _permissions, ...details } = { ...base, ...configured.get(name) }
    return Object.fromEntries(Object.entries({ ...details, name }).filter(([, value]) => value !== undefined && value !== null)) as OAuthScopeDefinition
  })
}

/** The signed-in user's numeric id (the `users` table uses integer ids). Responds 401 when nobody is signed in. */
export async function requireSessionUserId(event: H3Event): Promise<number> {
  const principal = await requireAuth(event, { sessionOnly: true })
  return Number(principal.user.id)
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
