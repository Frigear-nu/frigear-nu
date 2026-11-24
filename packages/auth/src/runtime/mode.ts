// `@frigear-nu/auth/mode`: free of `@nuxt/kit`, so other modules can call it from `moduleDependencies`.
export { isSafeRedirect } from './utils/redirect'

/**
 * - `server`: sign-in and cookie sessions on this app's server (the default).
 * - `client`: a public OAuth client signing in at an issuer, with no server of its own.
 * - `resource`: `client`'s sign-in at an issuer, plus a server of its own that accepts only the issuer's access tokens
 *   (bearer, through a resolver such as `@frigear-nu/oauth-resource`): access control, users and server modules, but no
 *   cookie sessions or sign-in routes.
 */
export type AuthMode = 'server' | 'client' | 'resource'

const MODES: readonly AuthMode[] = ['server', 'client', 'resource']

/** Whether the app has a server half (access control, the user store, server modules): `server` and `resource`. */
export const authModeHasServer = (mode: AuthMode): boolean => mode !== 'client'

/** Whether the app signs in at an issuer in the browser (the PKCE client): `client` and `resource`. */
export const authModeSignsInAtIssuer = (mode: AuthMode): boolean => mode !== 'server'

/**
 * The auth mode of the app: its own `authentication.mode`, `server` when unset. Only the app sets it, never a module
 * default: Nuxt runs `moduleDependencies` before it merges other modules' defaults, so a default would come too late
 * for the modules Auth, Authorization and Mobile pick from it. Throws on any other value.
 */
export function resolveAuthMode(nuxt: { options: object }): AuthMode {
  const mode = (nuxt.options as { authentication?: { mode?: unknown } }).authentication?.mode
  if (mode === undefined) return 'server'
  if (!MODES.includes(mode as AuthMode)) {
    throw new Error(`[@frigear-nu/auth] \`authentication.mode\` must be 'server', 'client' or 'resource', got ${JSON.stringify(mode)}.`)
  }
  return mode as AuthMode
}
