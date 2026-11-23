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
