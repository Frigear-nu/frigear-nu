import { defu } from 'defu'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { OAuthClientPublicConfig, StorageMode, StorageOption } from './types'

/**
 * The host's `runtimeConfig.public.oauthClient` over the module's values. Unlike a plain `defu`, a list the host sets
 * (`publicPaths`, `api.attachTo`) replaces the module's instead of being appended to it.
 */
export function mergePublicConfig(host: Partial<OAuthClientPublicConfig> | undefined, defaults: OAuthClientPublicConfig): OAuthClientPublicConfig {
  const merged = defu(host, defaults) as OAuthClientPublicConfig
  if (Array.isArray(host?.publicPaths)) merged.publicPaths = [...host.publicPaths]
  if (Array.isArray(host?.api?.attachTo)) merged.api = { ...merged.api, attachTo: [...host.api.attachTo] }
  return merged
}

// Build-time helpers of the module, pure so they can be tested without a Nuxt build.

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
      throw new Error(`[@frigear-nu/oauth-client] \`native.redirectUri\` "${input.redirectUri}" is not an absolute URI.`)
    }
    return input.redirectUri
  }
  if (!input.scheme) return undefined
  const scheme = input.scheme.trim().toLowerCase()
  if (!SCHEME.test(scheme)) {
    throw new Error(
      `[@frigear-nu/oauth-client] \`native.scheme\` "${input.scheme}" is not a valid URL scheme: it must start with a letter `
      + 'and contain only letters, digits, "+", "-" and "." (no "_"). Set `native.scheme` (or `native.redirectUri`) explicitly.',
    )
  }
  return `${scheme}:/${input.callbackPath.replace(/^\/+/, '')}`
}

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
  const source = ['NUXT_PUBLIC_OAUTH_CLIENT_SECRET', 'NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_SECRET'].find(name => input.env[name])
    ?? (input.configured ? 'runtimeConfig.public.oauthClient.clientSecret' : undefined)
  if (!source) return
  throw new Error(
    `[@frigear-nu/oauth-client] ${source} is set: the client secret would be embedded in the app bundle, where anyone `
    + 'can read it. Register a public client (no secret, PKCE) and unset it, or set `oauthClient.allowClientSecretInBundle: true` '
    + 'for a throwaway local build.',
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
  secureStorage: boolean
  preferences: boolean
}): { warning?: string } {
  if (!input.capacitor || input.prepare) return {}
  const install = 'Install `@aparajita/capacitor-secure-storage` (Keychain / Keystore)'
  const problem
    = input.mode === 'auto' && !input.secureStorage
      ? `${install}, or set \`oauthClient.storage: 'preferences'\` to keep tokens unencrypted in Preferences.`
      : input.mode === 'secure' && !input.secureStorage
        ? `\`oauthClient.storage\` is 'secure': ${install}.`
        : input.mode === 'preferences' && !input.preferences
          ? '`oauthClient.storage` is \'preferences\': install `@capacitor/preferences`.'
          : undefined
  if (!problem) return {}
  const message = `[@frigear-nu/oauth-client] ${problem}`
  if (input.dev) return { warning: message }
  throw new Error(message)
}

/** The source of `#oauth-client/native`: a lazy loader per installed native plugin, `null` for the others. */
export function nativeLoaderTemplate(input: { installed: Record<'app' | 'browser' | 'preferences' | 'secureStorage', boolean>, customStorage?: string }): string {
  const plugins = {
    app: ['@capacitor/app', 'App'],
    browser: ['@capacitor/browser', 'Browser'],
    preferences: ['@capacitor/preferences', 'Preferences'],
    secureStorage: ['@aparajita/capacitor-secure-storage', 'SecureStorage'],
  } as const
  const entries = (Object.keys(plugins) as (keyof typeof plugins)[]).map((key) => {
    const [pkg, name] = plugins[key]
    return `  ${key}: ${input.installed[key] ? `() => import(${JSON.stringify(pkg)}).then(m => m.${name})` : 'null'},`
  })
  return [
    '// Generated by @frigear-nu/oauth-client: only installed native plugins are imported, so a missing optional',
    '// peer never fails the build.',
    `export const plugins = {\n${entries.join('\n')}\n}`,
    `export const customStorage = ${input.customStorage ? `() => import(${JSON.stringify(input.customStorage)}).then(m => m.default)` : 'null'}`,
    '',
  ].join('\n')
}
