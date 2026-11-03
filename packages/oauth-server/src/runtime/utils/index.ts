// Pure helpers: safe to import from the app, Nitro and tests (`@frigear-nu/oauth-server/utils`).
import type { OAuthConfiguredClient, OAuthNormalizedClient, OAuthScopeDefinition, OAuthScopeGroup } from '../../types'

export type * from '../../types'
export { oauthServerApi, oidc } from './api'
export { addOAuthScope } from './build'

export const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const
export const DEFAULT_CALLBACK_PATH = '/auth/frigear'
/** `confidential` clients hold a secret; `public` clients (native and single-page apps) cannot and rely on PKCE alone. */
export const CLIENT_TYPES = ['confidential', 'public'] as const

/** Schemes that can never be a native app redirect: they are web schemes, or can run or leak content. */
const NON_NATIVE_SCHEMES = new Set([
  'http:', 'https:', 'ws:', 'wss:', 'ftp:', 'file:', 'javascript:', 'data:', 'blob:', 'vbscript:', 'about:', 'mailto:', 'tel:', 'sms:', 'chrome:', 'view-source:',
])

/** Whether a user holding `roles` may use an application restricted to `allowedRoles`. Empty = everyone. */
export function matchesAllowedRoles(allowedRoles: readonly string[] | null | undefined, roles: readonly string[]): boolean {
  if (!allowedRoles || allowedRoles.length === 0) return true
  return allowedRoles.some(role => roles.includes(role))
}

/** Splits a space separated scope string and drops duplicates and blanks. */
export function parseScope(scope: string | null | undefined): string[] {
  return [...new Set((scope ?? '').split(/\s+/).filter(Boolean))]
}

/** The requested scopes that the server supports; falls back to the defaults when none were requested. */
export function resolveScope(requested: string | null | undefined, supported: readonly string[]): string[] {
  const asked = parseScope(requested)
  if (asked.length === 0) return [...DEFAULT_SCOPES]
  return asked.filter(scope => supported.includes(scope))
}

/** A list from config or env: an array, or a comma separated string (`NUXT_*` env vars). Trimmed, no blanks. */
export function parseList(value: readonly string[] | string | null | undefined): string[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(',')
  return list.map(item => item.trim()).filter(Boolean)
}

/**
 * Merges scope definitions by name (a later definition adds to an earlier one), so a module's `addOAuthScope` and the
 * host's `scopes` can describe the same scope. Order of first appearance is kept.
 */
export function mergeScopeDefinitions(definitions: readonly (string | OAuthScopeDefinition)[]): OAuthScopeDefinition[] {
  const merged = new Map<string, OAuthScopeDefinition>()
  for (const entry of definitions) {
    const definition = typeof entry === 'string' ? { name: entry } : entry
    const name = definition.name?.trim()
    if (!name || /\s/.test(name)) throw new Error(`An OAuth scope name must be a single word, got "${definition.name}".`)
    merged.set(name, { ...merged.get(name), ...definition, name })
  }
  return [...merged.values()]
}

/** The consent screen's groups: this server's own scopes (no `service`) first, then one group per service in order. */
export function groupScopesByService(scopes: readonly OAuthScopeDefinition[]): OAuthScopeGroup[] {
  const groups = new Map<string | null, OAuthScopeDefinition[]>([[null, []]])
  for (const scope of scopes) {
    const service = scope.service || null
    groups.set(service, [...(groups.get(service) ?? []), scope])
  }
  return [...groups].filter(([, list]) => list.length).map(([service, list]) => ({ service, scopes: list }))
}

/** HTTPS is required, except for `localhost` / loopback development hosts. */
export function isSecureOrigin(url: URL): boolean {
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

/**
 * A redirect URI that opens a native app: a private-use scheme such as `com.example.app:/callback` (RFC 8252 §7.1) or a
 * webview origin such as `capacitor://localhost/callback`. No web or dangerous schemes, credentials, fragments or
 * wildcards. Only meaningful for `public` clients, and always matched exactly.
 */
export function isNativeRedirectUri(value: string | URL): boolean {
  let url: URL
  try {
    url = typeof value === 'string' ? new URL(value) : value
  }
  catch {
    return false
  }
  if (!/^[a-z][a-z0-9+.-]*:$/.test(url.protocol) || NON_NATIVE_SCHEMES.has(url.protocol)) return false
  if (url.username || url.password || url.hash) return false
  return !url.href.includes('*')
}

/** A website as people read it: the host without `www.` (`https://www.example.com/app` → `example.com`). */
export function websiteDomain(value: string | null | undefined): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  }
  catch {
    return value
  }
}

export function normalizeWebsiteUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new Error('The website URL is not a valid URL.')
  }
  if (!isSecureOrigin(url)) throw new Error('The website URL must use https (http is only allowed for localhost).')
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('The website URL must be an origin without a path.')
  return url.origin
}

/** `https://*.vercel.app` -> a regex matching one host label in place of `*`. Everything else is matched literally. */
export function previewPatternToRegExp(pattern: string, callbackPath: string): RegExp {
  const escaped = pattern
    .replace(/\/+$/, '')
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/.]+')
  const callback = callbackPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}${callback}$`)
}

export type RedirectUriRules = {
  websiteUrl: string
  previewUrlPattern?: string | null
  redirectUris?: readonly string[] | null
  callbackPath?: string
  /** Public clients only: also accept the native redirect URIs listed in `redirectUris`. */
  allowNativeRedirects?: boolean
}

/**
 * Exact match on `websiteUrl + callbackPath`, an explicit extra redirect URI, or the preview pattern. Native redirect URIs
 * (see `isNativeRedirectUri`) are only accepted for public clients, and only when listed in `redirectUris`.
 */
export function validateRedirectUri(redirectUri: string, rules: RedirectUriRules): boolean {
  const callbackPath = rules.callbackPath ?? DEFAULT_CALLBACK_PATH
  let url: URL
  try {
    url = new URL(redirectUri)
  }
  catch {
    return false
  }
  if (url.hash) return false
  if (!isSecureOrigin(url)) return rules.allowNativeRedirects === true && isNativeRedirectUri(url) && !!rules.redirectUris?.includes(redirectUri)
  if (redirectUri === `${rules.websiteUrl.replace(/\/+$/, '')}${callbackPath}`) return true
  if (rules.redirectUris?.includes(redirectUri)) return true
  if (rules.previewUrlPattern) return previewPatternToRegExp(rules.previewUrlPattern, callbackPath).test(redirectUri)
  return false
}

/** Prefixed random id, e.g. `newId('app')` -> `app_3f9c…`. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/** `scheme://host[:port]`, nothing else. `capacitor://localhost` is one even though `URL.origin` calls it "null". */
export function isExactOrigin(origin: string): boolean {
  if (origin === '*' || !URL.canParse(origin)) return false
  const url = new URL(origin)
  return !!url.host && origin === `${url.protocol}//${url.host}`
}

/** The id of a configured client: 3 to 64 letters, digits, `.`, `_`, `-`; never the `app_` prefix of created ones. */
export const CONFIGURED_CLIENT_ID = /^[a-z0-9][\w.-]{2,63}$/i

export type NormalizeClientsOptions = {
  /** Development (`nuxt dev`): also accept each client's `devRedirectUris`. */
  dev?: boolean
  /** The server's `callbackPath`, to check that every redirect URI is accepted as configured. */
  callbackPath?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

function stringList(value: unknown, what: string, max: number, maxLength: number): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${what} must be a list of strings.`)
  const list = [...new Set((value as string[]).map(item => item.trim()).filter(Boolean))]
  if (list.length > max) throw new Error(`${what} may have at most ${max} entries.`)
  const long = list.find(item => item.length > maxLength)
  if (long) throw new Error(`${what} has an entry longer than ${maxLength} characters.`)
  return list
}

function optionalText(value: unknown, what: string, max: number): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${what} must be a string.`)
  const text = value.trim()
  if (text.length > max) throw new Error(`${what} may be at most ${max} characters.`)
  return text || null
}

/** A web redirect URI (https, or http on localhost) or a native one; never a fragment, credentials or a wildcard. */
function isAllowedRedirectUri(uri: string): boolean {
  if (uri.includes('*') || !URL.canParse(uri)) return false
  const url = new URL(uri)
  return !url.hash && !url.username && !url.password && (isSecureOrigin(url) || isNativeRedirectUri(url))
}

/** The origin a page at this redirect URI calls from, if it has one (`com.example.app:/cb` has none). */
function redirectOrigin(uri: string): string | undefined {
  const url = new URL(uri)
  return url.host ? `${url.protocol}//${url.host}` : undefined
}

/**
 * Validates `oauthServer.clients` (or the JSON of `NUXT_OAUTH_SERVER_CLIENTS`) and turns each entry into the application
 * it stands for: a `public` client with a fixed id, its redirect URIs (plus `devRedirectUris` when `dev`), a derived
 * `websiteUrl` and the CORS origins it adds. Throws an `Error` naming the client and the problem.
 */
export function normalizeConfiguredClients(input: unknown, options: NormalizeClientsOptions = {}): OAuthNormalizedClient[] {
  let value = input
  if (typeof value === 'string') {
    if (!value.trim()) return []
    try {
      value = JSON.parse(value)
    }
    catch {
      throw new Error('clients must be a JSON array of clients.')
    }
  }
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error('clients must be a list of clients.')

  const seen = new Set<string>()
  return (value as unknown[]).map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`clients[${index}] must be an object.`)
    const client = entry as Partial<OAuthConfiguredClient> & Record<string, unknown>
    const id = typeof client.id === 'string' ? client.id.trim() : ''
    const label = `Client "${id || index}"`
    if (!CONFIGURED_CLIENT_ID.test(id)) throw new Error(`${label}: the id must be 3 to 64 letters, digits, ".", "_" or "-", starting with a letter or digit.`)
    if (/^app_/i.test(id)) throw new Error(`${label}: ids starting with "app_" are reserved for applications created in the admin UI.`)
    if (seen.has(id.toLowerCase())) throw new Error(`${label}: the id is used twice.`)
    seen.add(id.toLowerCase())

    const name = typeof client.name === 'string' ? client.name.trim() : ''
    if (!name || name.length > 120) throw new Error(`${label}: a name of 1 to 120 characters is required.`)
    if (client.type !== undefined && client.type !== 'public') {
      throw new Error(`${label}: only public clients can be configured (type "public"); register confidential ones in the admin UI.`)
    }

    const redirectUris = [...new Set([
      ...stringList(client.redirectUris, `${label}: redirectUris`, 20, 2048),
      ...(options.dev ? stringList(client.devRedirectUris, `${label}: devRedirectUris`, 20, 2048) : []),
    ])]
    if (!redirectUris.length) throw new Error(`${label}: at least one redirect URI is required.`)
    if (redirectUris.length > 20) throw new Error(`${label}: at most 20 redirect URIs are allowed.`)
    const invalid = redirectUris.find(uri => !isAllowedRedirectUri(uri))
    if (invalid) {
      throw new Error(`${label}: "${invalid}" is not a valid redirect URI (https, http for localhost, or a native app URI such as "com.example.app:/auth/callback").`)
    }

    let websiteUrl: string
    if (client.websiteUrl !== undefined && client.websiteUrl !== null) {
      try {
        websiteUrl = normalizeWebsiteUrl(String(client.websiteUrl))
      }
      catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`, { cause: error })
      }
    }
    else {
      const web = redirectUris.find(uri => isSecureOrigin(new URL(uri)))
      const first = new URL(redirectUris[0]!)
      // A native website (`com.example.app:`) adds no redirect URI: native ones are only ever matched exactly.
      websiteUrl = web ? new URL(web).origin : first.host ? `${first.protocol}//${first.host}` : first.protocol
    }

    const rules = { websiteUrl, redirectUris, callbackPath: options.callbackPath, allowNativeRedirects: true }
    const refused = redirectUris.find(uri => !validateRedirectUri(uri, rules))
    if (refused) throw new Error(`${label}: "${refused}" would not be accepted as a redirect URI.`)

    let corsOrigins: string[]
    if (client.corsOrigins === false) corsOrigins = []
    else if (client.corsOrigins === undefined || client.corsOrigins === null) corsOrigins = redirectUris.map(redirectOrigin).filter((origin): origin is string => !!origin)
    else corsOrigins = stringList(client.corsOrigins, `${label}: corsOrigins`, 20, 2048)
    const badOrigin = corsOrigins.find(origin => !isExactOrigin(origin))
    if (badOrigin) throw new Error(`${label}: corsOrigins must be exact origins such as "https://app.example.com" or "capacitor://localhost", got "${badOrigin}".`)

    const names = (what: 'allowedRoles' | 'tags') => stringList(client[what], `${label}: ${what}`, 50, 64)
    return {
      id,
      name,
      clientType: 'public' as const,
      websiteUrl,
      redirectUris,
      description: optionalText(client.description, `${label}: description`, 1000),
      icon: optionalText(client.icon, `${label}: icon`, 120),
      allowedRoles: names('allowedRoles').sort(),
      tags: names('tags'),
      corsOrigins: [...new Set(corsOrigins)],
    }
  })
}
