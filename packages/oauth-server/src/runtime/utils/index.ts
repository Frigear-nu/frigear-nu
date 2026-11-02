// Pure helpers: safe to import from the app, Nitro and tests (`@frigear-nu/oauth-server/utils`).
import type { OAuthScopeDefinition, OAuthScopeGroup } from '../../types'

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
