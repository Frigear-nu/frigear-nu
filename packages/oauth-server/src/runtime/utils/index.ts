// Pure helpers: safe to import from the app, Nitro and tests (`@frigear-nu/oauth-server/utils`).
export type * from '../../types'
export { oauthServerApi, oidc } from './api'

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
