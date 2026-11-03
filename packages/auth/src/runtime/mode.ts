// `@frigear-nu/auth/mode`: free of `@nuxt/kit`, so other modules can call it from `moduleDependencies`.
export { isSafeRedirect } from './utils/redirect'

/** `server`: sessions on this app's server (the default). `client`: a public OAuth client signing in at an issuer. */
export type AuthMode = 'server' | 'client'

const MODES: readonly AuthMode[] = ['server', 'client']

/**
 * The auth mode of the app: its own `authentication.mode`, `server` when unset. Only the app sets it, never a module
 * default: Nuxt runs `moduleDependencies` before it merges other modules' defaults, so a default would come too late
 * for the modules Auth, Authorization and Mobile pick from it. Throws on any other value.
 */
export function resolveAuthMode(nuxt: { options: object }): AuthMode {
  const mode = (nuxt.options as { authentication?: { mode?: unknown } }).authentication?.mode
  if (mode === undefined) return 'server'
  if (!MODES.includes(mode as AuthMode)) {
    throw new Error(`[@frigear-nu/auth] \`authentication.mode\` must be 'server' or 'client', got ${JSON.stringify(mode)}.`)
  }
  return mode as AuthMode
}
