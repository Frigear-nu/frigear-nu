import { defu } from 'defu'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AuthClientPublicConfig, StorageMode, StorageOption } from './runtime/client/types'
import { isSafeRedirect } from './runtime/utils/redirect'

// Build-time helpers of the client mode, pure so they can be tested without a Nuxt build.

/**
 * The host's `runtimeConfig.public.authentication.client` over the module's values. Unlike a plain `defu`, a list the
 * host sets (`apiOrigins`) replaces the module's instead of being appended to it.
 */
export function mergeClientPublicConfig(host: Partial<AuthClientPublicConfig> | undefined, defaults: AuthClientPublicConfig): AuthClientPublicConfig {
  const merged = defu(host, defaults) as AuthClientPublicConfig
  if (Array.isArray(host?.apiOrigins)) merged.apiOrigins = [...host.apiOrigins]
  return merged
}

const SCHEME = /^[a-z][a-z0-9+.-]*$/

/**
 * The native redirect URI: `native.redirectUri` as is, else `<scheme in lowercase>:<callbackPath>`
 * (`nu.Frigear.App` → `nu.frigear.app:/auth/callback`). Throws on a scheme RFC 3986 does not allow
 * (`ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )`), e.g. one with `_` or starting with a digit.
 */
export function resolveNativeRedirectUri(input: { scheme?: string, redirectUri?: string, callbackPath: string }): string | undefined {
  if (input.redirectUri) {
    const scheme = /^([^:/?#]+):/.exec(input.redirectUri)?.[1]
    if (!scheme || !SCHEME.test(scheme.toLowerCase())) {
      throw new Error(`[@frigear-nu/auth] \`authentication.client.native.redirectUri\` "${input.redirectUri}" is not an absolute URI.`)
    }
    return input.redirectUri
  }
  if (!input.scheme) return undefined
  const scheme = input.scheme.trim().toLowerCase()
  if (!SCHEME.test(scheme)) {
    throw new Error(
      `[@frigear-nu/auth] \`authentication.client.native.scheme\` "${input.scheme}" is not a valid URL scheme: it must start with a letter `
      + 'and contain only letters, digits, "+", "-" and "." (no "_"). Set `client.native.scheme` (or `client.native.redirectUri`) explicitly.',
    )
  }
  return `${scheme}:/${input.callbackPath.replace(/^\/+/, '')}`
}

/** Every env var that carries a client secret: the two Auth reads. */
export const SECRET_ENV_NAMES = [
  'NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_SECRET',
  'NUXT_PUBLIC_AUTHENTICATION_CLIENT_SECRET',
] as const

/**
 * A client secret compiled into a static bundle is public to anyone with the app. Refuses a production build that
 * would contain one, unless `allow` is set. `nuxt dev`, `nuxt prepare` and `nuxt typecheck` emit no bundle.
 */
export function assertNoClientSecretInBundle(input: {
  dev: boolean
  prepare: boolean
  allow: boolean
  env: Record<string, string | undefined>
  configured?: string
}): void {
  if (input.dev || input.prepare || input.allow) return
  const source = SECRET_ENV_NAMES.find(name => input.env[name])
    ?? (input.configured ? 'runtimeConfig.public.authentication.client.clientSecret' : undefined)
  if (!source) return
  throw new Error(
    `[@frigear-nu/auth] ${source} is set: the client secret would be embedded in the app bundle, where anyone `
    + 'can read it. Register a public client (no secret, PKCE) and unset it, or set '
    + '`authentication.client.allowClientSecretInBundle: true` for a throwaway local build.',
  )
}

/** Whether `pkg` is installed for an app in `rootDir` (its `node_modules`, or a parent's, or one of `modulesDirs`). */
export function isPackageInstalled(pkg: string, rootDir: string, modulesDirs: string[] = []): boolean {
  const dirs = new Set(modulesDirs)
  for (let dir = rootDir; ; dir = dirname(dir)) {
    dirs.add(join(dir, 'node_modules'))
    if (dirname(dir) === dir) break
  }
  return [...dirs].some(dir => existsSync(join(dir, pkg, 'package.json')))
}

const MODES = new Set<StorageMode>(['auto', 'secure', 'preferences', 'local', 'session', 'memory'])

/** The storage mode, and the file of a custom storage. */
export function parseStorageOption(storage: StorageOption | undefined): { mode: StorageMode, file?: string } {
  if (!storage) return { mode: 'auto' }
  return MODES.has(storage as StorageMode) ? { mode: storage as StorageMode } : { mode: 'custom', file: storage }
}

/**
 * Where tokens end up on a device, checked at build time. An app with `@capacitor/core` installed is a native app:
 * without the secure storage plugin `auto` would keep tokens unencrypted, which fails a production build (a warning in
 * development) unless the app chose `preferences`.
 */
export function checkNativeStorage(input: {
  mode: StorageMode
  dev: boolean
  prepare: boolean
  capacitor: boolean
  /** A Tauri app (a `@tauri-apps/plugin-*` it signs in with is installed): the Capacitor plugins do not apply. */
  tauri?: boolean
  secureStorage: boolean
  preferences: boolean
}): { warning?: string } {
  if (!input.capacitor || input.tauri || input.prepare) return {}
  const install = 'Install `@aparajita/capacitor-secure-storage` (Keychain / Keystore)'
  const problem
    = input.mode === 'auto' && !input.secureStorage
      ? `${install}, or set \`authentication.client.storage: 'preferences'\` to keep tokens unencrypted in Preferences.`
      : input.mode === 'secure' && !input.secureStorage
        ? `\`authentication.client.storage\` is 'secure': ${install}.`
        : input.mode === 'preferences' && !input.preferences
          ? '`authentication.client.storage` is \'preferences\': install `@capacitor/preferences`.'
          : undefined
  if (!problem) return {}
  const message = `[@frigear-nu/auth] ${problem}`
  if (input.dev) return { warning: message }
  throw new Error(message)
}

/** The native plugins `#auth/native` can load: `[package, export]`, the Capacitor ones wrapped in `withoutThen`. */
export const NATIVE_PLUGIN_PACKAGES = {
  app: ['@capacitor/app', 'App'],
  browser: ['@capacitor/browser', 'Browser'],
  preferences: ['@capacitor/preferences', 'Preferences'],
  secureStorage: ['@aparajita/capacitor-secure-storage', 'SecureStorage'],
  // Tauri v2: plain ES modules, loaded as the module namespace (no proxy, so no `withoutThen`).
  opener: ['@tauri-apps/plugin-opener', null],
  deepLink: ['@tauri-apps/plugin-deep-link', null],
  store: ['@tauri-apps/plugin-store', null],
  window: ['@tauri-apps/api', null],
} as const

export type NativePluginKey = keyof typeof NATIVE_PLUGIN_PACKAGES

/** The Tauri plugins: an app with any of them installed is a Tauri app. */
export const TAURI_PLUGIN_KEYS = ['opener', 'deepLink', 'store'] as const satisfies readonly NativePluginKey[]

/**
 * The source of `#auth/native`: a lazy loader per installed native plugin, `null` for the others. `helper` is the
 * module exporting `withoutThen` (`runtime/client/capacitor/adapters`): a loader cannot resolve to the bare plugin proxy.
 * A key missing from `installed` counts as not installed.
 */
export function nativeLoaderTemplate(input: { installed: Partial<Record<NativePluginKey, boolean>>, customStorage?: string, helper: string }): string {
  const loader = (key: NativePluginKey): string => {
    const [pkg, name] = NATIVE_PLUGIN_PACKAGES[key]
    // `getCurrentWindow` lives in a subpath of `@tauri-apps/api`.
    if (key === 'window') return `() => import("@tauri-apps/api/window")`
    return name ? `() => import(${JSON.stringify(pkg)}).then(m => withoutThen(m.${name}))` : `() => import(${JSON.stringify(pkg)})`
  }
  const entries = (Object.keys(NATIVE_PLUGIN_PACKAGES) as NativePluginKey[])
    .map(key => `  ${key}: ${input.installed[key] ? loader(key) : 'null'},`)
  return [
    '// Generated by @frigear-nu/auth: only installed native plugins are imported, so a missing optional',
    '// peer never fails the build.',
    `import { withoutThen } from ${JSON.stringify(input.helper)}`,
    `export const plugins = {\n${entries.join('\n')}\n}`,
    `export const customStorage = ${input.customStorage ? `() => import(${JSON.stringify(input.customStorage)}).then(m => m.default)` : 'null'}`,
    '',
  ].join('\n')
}

/** The declarations of `#auth/native`, kept next to the generated module. `types` resolves a runtime file for an import. */
export function nativeLoaderTypes(types: (file: string) => string): string {
  return `import type { AppPluginLike, BrowserPluginLike, PreferencesPluginLike, SecureStoragePluginLike } from ${types('capacitor/adapters')}
import type { DeepLinkPluginLike, OpenerPluginLike, StorePluginLike, TauriWindowModuleLike } from ${types('tauri/adapters')}
import type { TokenStorage } from ${types('core/types')}
export declare const plugins: {
  app: (() => Promise<AppPluginLike>) | null
  browser: (() => Promise<BrowserPluginLike>) | null
  preferences: (() => Promise<PreferencesPluginLike>) | null
  secureStorage: (() => Promise<SecureStoragePluginLike>) | null
  opener: (() => Promise<OpenerPluginLike>) | null
  deepLink: (() => Promise<DeepLinkPluginLike>) | null
  store: (() => Promise<StorePluginLike>) | null
  window: (() => Promise<TauriWindowModuleLike>) | null
}
export declare const customStorage: (() => Promise<TokenStorage | (() => TokenStorage | Promise<TokenStorage>)>) | null
`
}

const GUARD_KEYS = ['authenticated', 'guest', 'permission'] as const

/** The `routeRules` patterns that carry a guard of `@frigear-nu/authorization` (`authenticated`, `guest`, `permission`). */
export function findGuardRules(routeRules: Record<string, unknown> | undefined): string[] {
  return Object.entries(routeRules ?? {})
    .filter(([, rule]) => !!rule && typeof rule === 'object' && GUARD_KEYS.some(key => key in rule))
    .map(([pattern]) => pattern)
}

/** The client mode's public paths: the login page (and where sign-outs are sent) and the callback. */
export function clientPublicPaths(input: { loginPage?: string, loginPath: string, callbackPath: string }): string[] {
  return [...new Set([input.loginPage, input.loginPath, input.callbackPath].filter(isSafeRedirect))]
}
