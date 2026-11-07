// Pure helpers: safe to import from the app, Nitro and tests (`@frigear-nu/oauth-server/utils`).
import type { ClientType, OAuthClientKind, OAuthConfiguredClient, OAuthNormalizedClient, OAuthScopeDefinition, OAuthScopeGroup, RefreshTokenPolicy } from '../../types'

export type * from '../../types'
export { oauthServerApi, oidc } from './api'
export { addOAuthScope } from './build'

export const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const
export const DEFAULT_CALLBACK_PATH = '/auth/frigear'
/** `confidential` clients hold a secret; `public` clients (native and single-page apps) cannot and rely on PKCE alone. */
export const CLIENT_TYPES = ['confidential', 'public'] as const

const DAY = 60 * 60 * 24
/** The default refresh-token policy: 30 days idle, no cap on the whole sign-in. */
export const DEFAULT_REFRESH_TOKEN_POLICY: RefreshTokenPolicy = { idleTtl: 30 * DAY, maxAge: null }
/** No refresh-token lifetime may exceed two years: a forgotten device stops working by itself. */
export const MAX_REFRESH_TOKEN_LIFETIME = 2 * 365 * DAY
/** Browser clients keep refresh tokens where scripts can read them: above this idle lifetime they get a warning. */
export const BROWSER_SESSION_WARN_AFTER = 7 * DAY

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

/**
 * A parsed preview URL pattern: `https://` + a host whose first label holds one `*` (with an optional literal prefix or
 * suffix) followed by at least two literal labels, an optional port and an optional path prefix. Lower-case ASCII only,
 * never a query, fragment, userinfo, `%` or `\`.
 */
export type PreviewUrlPattern = {
  /** Matches `URL.hostname`: the `*` stands for one DNS label of `[a-z0-9-]`. */
  host: RegExp
  /** `URL.port`: `''` for the default port. */
  port: string
  /** The path prefix before the callback path, without a trailing `/` (`''` for none). */
  path: string
}

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const PREVIEW_URL_PATTERN = new RegExp(
  `^https://([a-z0-9-]*)\\*([a-z0-9-]*)((?:\\.${LABEL}){2,})(?::(\\d{1,5}))?((?:/[\\w~-][\\w.~-]*)*)/*$`,
)

/**
 * Parse an admin-entered preview URL pattern such as `https://*.vercel.app` or `https://myapp-*.vercel.app`, or `null`
 * when it is not one. Used to validate the pattern on save and to match redirect URIs against it.
 */
export function parsePreviewUrlPattern(pattern: string): PreviewUrlPattern | null {
  const match = PREVIEW_URL_PATTERN.exec(pattern.trim())
  if (!match) return null
  const [, prefix = '', suffix = '', rest = '', port = '', path = ''] = match
  if (port && (Number(port) < 1 || Number(port) > 65535 || port === '443' || port.startsWith('0'))) return null
  const literal = (text: string) => text.replace(/[.-]/g, '\\$&')
  return {
    // The lookahead keeps the whole first label a valid DNS label (1-63 chars, no leading or trailing `-`).
    host: new RegExp(`^(?=${LABEL}\\.)${literal(prefix)}[a-z0-9-]+${literal(suffix)}${literal(rest)}$`),
    port,
    path,
  }
}

/**
 * Whether `redirectUri` is the callback of a preview deployment matching `pattern`. Compared on the parsed URL, never the
 * raw string: the URI must be plain printable ASCII without `%`, `\`, `@`, `?` or `#`, must serialise back to itself
 * (`new URL(uri).href === uri`), and its scheme, port and path must equal the pattern's. Only the `*` label varies.
 */
export function matchesPreviewUrlPattern(redirectUri: string, pattern: string, callbackPath: string): boolean {
  const parsed = parsePreviewUrlPattern(pattern)
  if (!parsed) return false
  if (!/^[\x21-\x7E]+$/.test(redirectUri) || /[%\\@?#]/.test(redirectUri)) return false
  let url: URL
  try {
    url = new URL(redirectUri)
  }
  catch {
    return false
  }
  if (url.href !== redirectUri) return false
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false
  if (url.port !== parsed.port || url.pathname !== `${parsed.path}${callbackPath}`) return false
  return parsed.host.test(url.hostname)
}

/**
 * @deprecated Matching a regex against the raw redirect URI is unsafe: `%2e`, `\`, `?` and U+3002 make the browser go to
 * another host than the one the regex saw. Use `matchesPreviewUrlPattern`, which compares the parsed URL.
 */
export function previewPatternToRegExp(pattern: string, callbackPath: string): RegExp {
  const escaped = pattern
    .replace(/\/+$/, '')
    .split('*')
    .map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[a-z0-9-]+')
  const callback = callbackPath.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}${callback}$`)
}

export type RedirectUriRules = {
  /** `null` (or empty) for a public client without a website: only its listed redirect URIs match. */
  websiteUrl: string | null
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
  if (rules.websiteUrl && redirectUri === `${rules.websiteUrl.replace(/\/+$/, '')}${callbackPath}`) return true
  if (rules.redirectUris?.includes(redirectUri)) return true
  if (rules.previewUrlPattern) return matchesPreviewUrlPattern(redirectUri, rules.previewUrlPattern, callbackPath)
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
 * `websiteUrl` (`null` for a native-only client) and the CORS origins it adds. Throws an `Error` naming the client and the problem.
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

    let websiteUrl: string | null
    if (client.websiteUrl !== undefined && client.websiteUrl !== null) {
      try {
        websiteUrl = normalizeWebsiteUrl(String(client.websiteUrl))
      }
      catch (error) {
        throw new Error(`${label}: ${(error as Error).message}`, { cause: error })
      }
    }
    else {
      // A native-only client has no website: its redirect URIs are only ever matched exactly.
      const web = redirectUris.find(uri => isSecureOrigin(new URL(uri)))
      websiteUrl = web ? new URL(web).origin : null
    }
    if (client.listed !== undefined && typeof client.listed !== 'boolean') throw new Error(`${label}: listed must be true or false.`)

    const rules = { websiteUrl, redirectUris, callbackPath: options.callbackPath, allowNativeRedirects: true }
    const refused = redirectUris.find(uri => !validateRedirectUri(uri, rules))
    if (refused) throw new Error(`${label}: "${refused}" would not be accepted as a redirect URI.`)

    let corsOrigins: string[]
    if (client.corsOrigins === false) corsOrigins = []
    else if (client.corsOrigins === undefined || client.corsOrigins === null) corsOrigins = redirectUris.map(redirectOrigin).filter((origin): origin is string => !!origin)
    else corsOrigins = stringList(client.corsOrigins, `${label}: corsOrigins`, 20, 2048)
    const badOrigin = corsOrigins.find(origin => !isExactOrigin(origin))
    if (badOrigin) throw new Error(`${label}: corsOrigins must be exact origins such as "https://app.example.com" or "capacitor://localhost", got "${badOrigin}".`)

    const refreshToken = normalizeClientRefreshToken(client.refreshToken, label)
    if (client.allowLongBrowserSessions !== undefined && typeof client.allowLongBrowserSessions !== 'boolean') {
      throw new Error(`${label}: allowLongBrowserSessions must be true or false.`)
    }

    const names = (what: 'allowedRoles' | 'tags') => stringList(client[what], `${label}: ${what}`, 50, 64)
    return {
      id,
      name,
      clientType: 'public' as const,
      websiteUrl,
      isListed: client.listed ?? true,
      redirectUris,
      description: optionalText(client.description, `${label}: description`, 1000),
      icon: optionalText(client.icon, `${label}: icon`, 120),
      allowedRoles: names('allowedRoles').sort(),
      tags: names('tags'),
      corsOrigins: [...new Set(corsOrigins)],
      refreshToken,
      allowLongBrowserSessions: client.allowLongBrowserSessions ?? false,
    }
  })
}

function normalizeClientRefreshToken(value: unknown, label: string): { idleTtl: number | null, maxAge: number | null } {
  if (value === undefined || value === null) return { idleTtl: null, maxAge: null }
  if (!isRecord(value)) throw new Error(`${label}: refreshToken must be an object such as { idleTtl: 15552000 }.`)
  const read = (key: 'idleTtl' | 'maxAge') => {
    const raw = value[key]
    if (raw === undefined || raw === null) return null
    try {
      return assertRefreshLifetime(raw, `refreshToken.${key}`)
    }
    catch (error) {
      throw new Error(`${label}: ${(error as Error).message}`, { cause: error })
    }
  }
  return { idleTtl: read('idleTtl'), maxAge: read('maxAge') }
}

/** A refresh-token lifetime in seconds: a positive integer of at most two years. Throws naming `what` otherwise. */
export function assertRefreshLifetime(value: unknown, what: string): number {
  const seconds = typeof value === 'string' && value.trim() ? Number(value) : value
  if (typeof seconds !== 'number' || !Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(`${what} must be a positive whole number of seconds, got "${String(value)}".`)
  }
  if (seconds > MAX_REFRESH_TOKEN_LIFETIME) {
    throw new Error(`${what} may be at most two years (${MAX_REFRESH_TOKEN_LIFETIME} seconds), got ${seconds}.`)
  }
  return seconds
}

/**
 * The global refresh-token policy from the module options: `refreshToken.idleTtl` (or the deprecated `refreshTokenTtl`),
 * default 30 days, and `refreshToken.maxAge`, default `null` (no cap). Throws on a value that is not allowed.
 */
export function resolveRefreshTokenOptions(options: { refreshToken?: Partial<RefreshTokenPolicy> | null, refreshTokenTtl?: number | null }): RefreshTokenPolicy {
  const idle = options.refreshToken?.idleTtl ?? options.refreshTokenTtl ?? DEFAULT_REFRESH_TOKEN_POLICY.idleTtl
  const maxAge = options.refreshToken?.maxAge ?? null
  return {
    idleTtl: assertRefreshLifetime(idle, 'refreshToken.idleTtl'),
    maxAge: maxAge === null ? null : assertRefreshLifetime(maxAge, 'refreshToken.maxAge'),
  }
}

/**
 * The policy a refresh token of this application gets: the application's own values (`null` = inherit), else the global
 * ones. Configured clients carry their `refreshToken` in these columns (config owns them).
 */
export function resolveRefreshTokenPolicy(
  application: { refreshIdleTtl?: number | null, refreshMaxAge?: number | null },
  global: RefreshTokenPolicy,
): RefreshTokenPolicy {
  return {
    idleTtl: application.refreshIdleTtl ?? global.idleTtl,
    maxAge: application.refreshMaxAge ?? global.maxAge,
  }
}

/** When a new refresh token expires: `min(now + idleTtl, authTime + maxAge)`. */
export function refreshTokenExpiresAt(policy: RefreshTokenPolicy, authTime: Date, now = new Date()): Date {
  const idle = now.getTime() + policy.idleTtl * 1000
  const cap = policy.maxAge === null ? Number.POSITIVE_INFINITY : authTime.getTime() + policy.maxAge * 1000
  return new Date(Math.min(idle, cap))
}

/**
 * What kind of client this is, for the session-length guardrails: `confidential` (a server holds the tokens),
 * `browser` (a public client with a web redirect: the tokens live in the browser, readable by any XSS) or `native` (a
 * public client whose redirect URIs are all custom-scheme or loopback: the tokens live in the keychain).
 */
export function oauthClientKind(client: { clientType: ClientType, websiteUrl?: string | null, redirectUris?: readonly string[] | null }): OAuthClientKind {
  if (client.clientType === 'confidential') return 'confidential'
  const uris = [...(client.websiteUrl ? [client.websiteUrl] : []), ...(client.redirectUris ?? [])]
  const web = uris.some((uri) => {
    if (!URL.canParse(uri)) return false
    const url = new URL(uri)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  })
  return web ? 'browser' : 'native'
}

/** Whether a browser client's idle lifetime is long enough to warn about (above 7 days). */
export function isLongBrowserSession(client: { clientType: ClientType, websiteUrl?: string | null, redirectUris?: readonly string[] | null }, idleTtl: number | null | undefined): boolean {
  return !!idleTtl && idleTtl > BROWSER_SESSION_WARN_AFTER && oauthClientKind(client) === 'browser'
}

/** The warning for a configured browser client with a long session, unless it set `allowLongBrowserSessions`. */
export function configuredClientWarnings(clients: readonly OAuthNormalizedClient[], global: RefreshTokenPolicy): string[] {
  return clients
    .filter(client => !client.allowLongBrowserSessions && isLongBrowserSession(client, client.refreshToken.idleTtl ?? global.idleTtl))
    .map(client => `Client "${client.id}" is a browser client (it has a web redirect URI) whose refresh tokens live ${Math.round((client.refreshToken.idleTtl ?? global.idleTtl) / DAY)} days unused. Browsers keep them where any XSS can read them; keep it at 7 days or less, or set allowLongBrowserSessions: true.`)
}
