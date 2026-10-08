// Pure helpers: safe to import from the app, Nitro and tests (`@frigear-nu/oauth-server/utils`).
export type * from '../../types'

export const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const
export const DEFAULT_CALLBACK_PATH = '/auth/frigear'

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
}

/** Exact match on `websiteUrl + callbackPath`, an explicit extra redirect URI, or the preview pattern. */
export function validateRedirectUri(redirectUri: string, rules: RedirectUriRules): boolean {
  const callbackPath = rules.callbackPath ?? DEFAULT_CALLBACK_PATH
  let url: URL
  try {
    url = new URL(redirectUri)
  }
  catch {
    return false
  }
  if (url.hash || !isSecureOrigin(url)) return false
  if (redirectUri === `${rules.websiteUrl.replace(/\/+$/, '')}${callbackPath}`) return true
  if (rules.redirectUris?.includes(redirectUri)) return true
  if (rules.previewUrlPattern) return previewPatternToRegExp(rules.previewUrlPattern, callbackPath).test(redirectUri)
  return false
}

/** Prefixed random id, e.g. `newId('app')` -> `app_3f9c…`. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
