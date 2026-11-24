import { OAuthConfigError } from '../core/errors'
import { isLoopbackHost, rewriteLoopbackUrl } from '../core/urls'
import { isSafeRedirect } from '../../utils/redirect'

export { shouldAttachToken } from '../core/urls'

// Pure helpers of the Nuxt runtime, kept apart so they can be tested without Nuxt.

/**
 * The redirect URI of this run: the native one when callbacks come as deep links (Capacitor, Tauri), else the configured web one or
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
      throw new OAuthConfigError('missing_redirect_uri', 'Running inside a native app, but `authentication.client.native.scheme` (or `native.redirectUri`) is not set.')
    }
    return input.nativeRedirectUri
  }
  if (input.redirectUri) return input.redirectUri
  return `${input.origin.replace(/\/+$/, '')}/${input.callbackPath.replace(/^\/+/, '')}`
}

/**
 * Whether a Tauri app signs in through the system browser and a deep link (`native.desktopFlow`): always with
 * `deep-link`, never with `redirect`, and with `auto` only outside `nuxt dev`. In development the webview loads the dev
 * server (`http://localhost:3000`), so a redirect inside it works, while deep links usually do not reach an unbundled
 * app.
 */
export function tauriUsesDeepLinks(flow: 'auto' | 'deep-link' | 'redirect' | undefined, dev: boolean): boolean {
  return flow === 'deep-link' || ((flow ?? 'auto') === 'auto' && !dev)
}

/** A same-app path to return to after sign-in (`isSafeRedirect`); anything else is dropped. */
export function safeReturnTo(value: unknown): string | undefined {
  return isSafeRedirect(value) ? value : undefined
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

/** What `resolveApiTargets` reads of the client config. */
export interface ApiTargetsConfig {
  issuer: string
  apiBase: string
  apiOrigins: string[]
  sameOrigin?: boolean
}

/**
 * Where the bearer token goes and `$api`'s base, after the loopback rewrite:
 *
 * - `apiBase`: `apiBase` when set, else the app's own origin with `sameOrigin` (resource mode), else the issuer.
 * - `clientAttachTo`: what the OAuth client's own requests may carry it to (the API base, the issuer, `apiOrigins`).
 * - `apiAttachTo`: what `$api` sends it to: `apiOrigins` when set, else the API base and the issuer.
 *
 * With `sameOrigin` both lists also hold `origin` (the page's `location.origin`, never rewritten: it is where the app
 * runs). Without an origin (outside a browser) it is left out.
 */
export function resolveApiTargets(config: ApiTargetsConfig, rewriteUrl: (url: string) => string, origin: string | undefined) {
  const own = config.sameOrigin && origin ? origin : undefined
  const apiBase = config.apiBase ? rewriteUrl(config.apiBase) : own ?? rewriteUrl(config.issuer)
  const withOwn = (list: string[]) => own && !list.includes(own) ? [...list, own] : list
  return {
    apiBase,
    ownOrigin: own,
    clientAttachTo: withOwn([config.apiBase || config.issuer, config.issuer, ...config.apiOrigins].map(rewriteUrl)),
    apiAttachTo: withOwn(config.apiOrigins.length ? config.apiOrigins.map(rewriteUrl) : [apiBase, rewriteUrl(config.issuer)]),
  }
}
