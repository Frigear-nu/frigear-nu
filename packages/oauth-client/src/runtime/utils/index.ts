import { OAuthConfigError } from '../core/errors'
import { isLoopbackHost, rewriteLoopbackUrl } from '../core/urls'

// Pure helpers of the Nuxt runtime, kept apart so they can be tested without Nuxt.

/**
 * The redirect URI of this run: the native one inside a Capacitor app, else the configured web one or
 * `<origin><callbackPath>`.
 */
export function resolveRedirectUri(input: {
  native: boolean
  origin: string
  callbackPath: string
  redirectUri?: string
  nativeRedirectUri?: string
}): string {
  if (input.native) {
    if (!input.nativeRedirectUri) {
      throw new OAuthConfigError('missing_redirect_uri', 'Running inside a native app, but `oauthClient.native.scheme` (or `native.redirectUri`) is not set.')
    }
    return input.nativeRedirectUri
  }
  if (input.redirectUri) return input.redirectUri
  return `${input.origin.replace(/\/+$/, '')}/${input.callbackPath.replace(/^\/+/, '')}`
}

/** `/docs/**` matches `/docs` and everything below it; anything else matches exactly (trailing slash aside). */
export function isPublicPath(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\/+$/, '') || '/'
  return patterns.some((pattern) => {
    if (!pattern) return false
    if (pattern.endsWith('/**')) {
      const base = pattern.slice(0, -3).replace(/\/+$/, '')
      return normalized === (base || '/') || normalized.startsWith(`${base}/`)
    }
    return normalized === (pattern.replace(/\/+$/, '') || '/')
  })
}

/** A same-app path to return to after sign-in; anything else (absolute or protocol-relative URLs) is dropped. */
export function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined
  return value
}

/** Whether a request to `url` (relative ones resolved against `baseURL`) may carry the bearer token. */
export function shouldAttachToken(url: string, baseURL: string, attachTo: string[]): boolean {
  let origin: string
  try {
    origin = new URL(url, baseURL || undefined).origin
  }
  catch {
    return false
  }
  return attachTo.some((allowed) => {
    try {
      return new URL(allowed).origin === origin
    }
    catch {
      return false
    }
  })
}

/**
 * The URL rewrite for a device in development: `setting` `true` swaps loopback hosts for `currentHost` (the host the
 * app was loaded from, i.e. the dev machine with Capacitor live reload), a string swaps them for that host.
 */
export function loopbackRewriter(setting: boolean | string, currentHost: string | undefined, dev: boolean): ((url: string) => string) | undefined {
  const host = typeof setting === 'string' ? setting : (setting && dev ? currentHost : undefined)
  if (!host || isLoopbackHost(host)) return undefined
  return url => rewriteLoopbackUrl(url, host)
}
