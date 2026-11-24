import type { DesktopManifest, ModuleOptions, ResolvedDesktopOptions } from '../../types'
import { TAURI_PLUGINS } from './native'

// Pure option normalization and Tauri config generation, shared by the module (which writes `.nuxt/desktop/*.json`)
// and the CLI (which merges them into `src-tauri/`).

const URL_SCHEME = /^[a-z][a-z0-9+.-]*$/
/** Tauri's `identifier`: reverse-DNS, letters, digits, `-` and `.` only. */
const IDENTIFIER = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/

/** Stands in for a missing `appId` while preparing types (`nuxt prepare`), never in a build. */
export const FALLBACK_APP_ID = 'com.example.desktop'
export const DEFAULT_VERSION = '0.1.0'
/** The label of the window the module owns in `tauri.conf.json` and the capabilities apply to. */
export const MAIN_WINDOW = 'main'
/** The capability file `frigear-desktop sync` owns. */
export const CAPABILITY_FILE = 'capabilities/frigear.json'
/** Local mode: the loading page `frigear-desktop sync` owns, relative to `src-tauri/` (`build.frontendDist`). */
export const LOADING_DIR = 'frigear-loading'
/** Local mode: where the compiled sidecars go, relative to `src-tauri/`. */
export const BINARIES_DIR = 'binaries'
/** Local mode: the origin pattern of the bundled server, for the capability's `remote.urls`. */
export const LOCAL_ORIGIN_PATTERN = 'http://127.0.0.1:*'

const BINARY_NAME = /^[a-z0-9][\w-]*$/i
const DATA_DIR_NAME = /^[\w.-]+$/

/** The Rust crate name from the app id's last segment (`nu.frigear.crew` → `crew`). */
export function crateName(appId: string): string {
  const last = appId.split('.').pop() ?? ''
  const name = last.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '')
  return name || 'app'
}

/** The URL scheme of an app id: lowercase, `_` becomes `-`. `undefined` when no valid scheme comes out of it. */
export function appIdScheme(appId: string): string | undefined {
  const scheme = appId.trim().toLowerCase().replace(/_/g, '-')
  return URL_SCHEME.test(scheme) ? scheme : undefined
}

export interface ResolveContext {
  /** The app's `package.json` version. */
  packageVersion?: string
  /** The Nuxt dev server port. Default `3000`. */
  devPort?: number
  /** `nuxt prepare`: a missing `appId` is not an error yet. */
  prepare?: boolean
}

export interface ResolveResult {
  options: ResolvedDesktopOptions
  errors: string[]
  warnings: string[]
}

/** Normalizes the `desktop` options. Problems are returned in `errors`, which the module turns into one error. */
export function resolveDesktopOptions(input: ModuleOptions, context: ResolveContext = {}): ResolveResult {
  const errors: string[] = []
  const warnings: string[] = []
  let mode = input.mode ?? 'remote'
  if (mode !== 'remote' && mode !== 'local') {
    errors.push(`\`mode\` must be 'remote' or 'local', got ${JSON.stringify(mode)}.`)
    mode = 'remote'
  }

  let appId = input.appId?.trim() ?? ''
  if (!appId) {
    if (!context.prepare) errors.push('`appId` is required: your app\'s reverse-DNS id, e.g. `nu.frigear.crew`.')
    appId = FALLBACK_APP_ID
  }
  else if (!IDENTIFIER.test(appId)) {
    errors.push(`\`appId\` "${appId}" is not a reverse-DNS id of letters, digits, "-" and "." (Tauri's \`identifier\`).`)
  }
  else if (appId.toLowerCase().endsWith('.app')) {
    warnings.push(`\`appId\` "${appId}" ends in ".app", which clashes with the macOS bundle extension: pick another last segment.`)
  }

  const defaultScheme = appIdScheme(appId)
  const schemes = input.deepLinks?.schemes === false
    ? []
    : [...new Set((input.deepLinks?.schemes ?? (defaultScheme ? [defaultScheme] : [])).map(scheme => scheme.trim().toLowerCase()))]
  for (const scheme of schemes) {
    if (!URL_SCHEME.test(scheme)) errors.push(`\`deepLinks.schemes\`: "${scheme}" is not a URL scheme (a letter, then letters, digits, "+", "-" and ".").`)
    else if (scheme === 'http' || scheme === 'https' || scheme === 'tauri') errors.push(`\`deepLinks.schemes\`: "${scheme}" cannot be a deep-link scheme.`)
  }

  const version = input.version ?? (context.packageVersion && SEMVER.test(context.packageVersion) ? context.packageVersion : DEFAULT_VERSION)
  if (!SEMVER.test(version)) errors.push(`\`version\` "${version}" is not a semver version (\`1.2.3\`).`)

  const appName = input.appName?.trim() || appId
  const kiosk = input.window?.kiosk === true
  const window: ResolvedDesktopOptions['window'] = {
    title: input.window?.title ?? appName,
    width: input.window?.width ?? 1280,
    height: input.window?.height ?? 800,
    resizable: kiosk ? false : input.window?.resizable ?? true,
    fullscreen: kiosk ? true : input.window?.fullscreen ?? false,
    decorations: kiosk ? false : input.window?.decorations ?? true,
    center: input.window?.center ?? true,
    ...(input.window?.minWidth !== undefined ? { minWidth: input.window.minWidth } : {}),
    ...(input.window?.minHeight !== undefined ? { minHeight: input.window.minHeight } : {}),
  }
  for (const key of ['width', 'height', 'minWidth', 'minHeight'] as const) {
    const value = window[key]
    if (value !== undefined && !(Number.isFinite(value) && value > 0)) errors.push(`\`window.${key}\` must be a positive number.`)
  }

  let updater: ResolvedDesktopOptions['updater'] = false
  if (input.updater) {
    const endpoints = input.updater.endpoints ?? []
    if (!endpoints.length) errors.push('`updater.endpoints` needs at least one URL.')
    for (const endpoint of endpoints) {
      if (!/^https:\/\//.test(endpoint)) errors.push(`\`updater.endpoints\`: "${endpoint}" must be an https URL.`)
    }
    if (!input.updater.pubkey?.trim()) errors.push('`updater.pubkey` is required (the public key of `tauri signer generate`).')
    updater = { endpoints, pubkey: input.updater.pubkey?.trim() ?? '' }
  }

  const devUrl = input.devUrl ?? `http://localhost:${context.devPort ?? 3000}`
  if (!/^https?:\/\/[^/]+/.test(devUrl)) errors.push(`\`devUrl\` "${devUrl}" must be an http(s) URL.`)

  const singleInstance = input.singleInstance !== false
  let local: ResolvedDesktopOptions['local'] = null
  if (mode === 'local') {
    local = {
      binaryName: input.local?.binaryName?.trim() || `${crateName(appId)}-server`,
      port: input.local?.port ?? 0,
      secureCookie: input.local?.secureCookie !== false,
      dataDirName: input.local?.dataDirName?.trim() || 'data',
    }
    if (!BINARY_NAME.test(local.binaryName)) errors.push(`\`local.binaryName\` "${local.binaryName}" must be letters, digits, "-" and "_".`)
    if (!Number.isInteger(local.port) || local.port < 0 || local.port > 65535) errors.push('`local.port` must be a port number (0 picks a free one).')
    if (!DATA_DIR_NAME.test(local.dataDirName) || /^\.+$/.test(local.dataDirName)) errors.push(`\`local.dataDirName\` "${local.dataDirName}" must be one folder name.`)
    if (!singleInstance) warnings.push('`singleInstance: false` in local mode lets a second launch start a second server on the same database: keep it on.')
  }

  return {
    options: {
      appId,
      appName,
      version,
      mode,
      // Remote mode bundles a static build; in local mode the bundled server renders the pages.
      spa: input.spa ?? mode === 'remote',
      window,
      deepLinks: { schemes },
      singleInstance,
      autostart: input.autostart === true,
      updater,
      devUrl,
      local,
    },
    errors,
    warnings,
  }
}

/** Lowercase URL schemes the app registers: the OAuth redirect URI's (unless http/https) and the deep-link schemes. */
export function resolveSchemes(redirectUri: string | undefined, deepLinkSchemes: string[]): string[] {
  const schemes = new Set<string>()
  const redirectScheme = redirectUri && /^([a-z][a-z0-9+.-]*):/i.exec(redirectUri)?.[1]?.toLowerCase()
  if (redirectScheme && redirectScheme !== 'https' && redirectScheme !== 'http') schemes.add(redirectScheme)
  for (const scheme of deepLinkSchemes) schemes.add(scheme.toLowerCase())
  return [...schemes]
}

export type JsonObject = { [key: string]: unknown }

/**
 * The parts of `src-tauri/tauri.conf.json` the module owns (`.nuxt/desktop/tauri.json`). `frigear-desktop sync` merges
 * them in; every other key is the app's. `schemes`: the deep-link schemes to register, the OAuth redirect URI's included
 * (`resolveSchemes`).
 */
export function tauriConfig(options: ResolvedDesktopOptions, schemes: string[] = options.deepLinks.schemes): JsonObject {
  const plugins: JsonObject = {
    'deep-link': { desktop: { schemes } },
  }
  if (options.updater) plugins.updater = { endpoints: options.updater.endpoints, pubkey: options.updater.pubkey }
  return {
    productName: options.appName,
    version: options.version,
    identifier: options.appId,
    build: {
      // Relative to `src-tauri/`. Remote: the output of `nuxt generate`. Local: the loading page the window shows until
      // the bundled server is ready (the shell then navigates it to the server).
      frontendDist: options.local ? LOADING_DIR : '../.output/public',
      devUrl: options.devUrl,
    },
    app: {
      windows: [{ label: MAIN_WINDOW, ...options.window }],
    },
    plugins,
    bundle: {
      active: true,
      ...(options.updater ? { createUpdaterArtifacts: true } : {}),
      // Local: the compiled server, `binaries/<name>-<target triple>` (Tauri appends the triple).
      ...(options.local ? { externalBin: [`${BINARIES_DIR}/${options.local.binaryName}`] } : {}),
    },
  }
}

/** The permissions of the generated capability (`src-tauri/capabilities/frigear.json`). */
export function capabilityPermissions(options: Pick<ResolvedDesktopOptions, 'autostart' | 'updater'>): string[] {
  const permissions = [
    'core:default',
    // Bringing the window back after sign-in (@frigear-nu/auth) and the window controls of `useDesktop()`.
    'core:window:allow-set-focus',
    'core:window:allow-minimize',
    'core:window:allow-maximize',
    'core:window:allow-unmaximize',
    'core:window:allow-toggle-maximize',
    'core:window:allow-close',
    'core:window:allow-set-fullscreen',
    // `opener:default` allows `open_url` for http(s), mailto and tel links (a bare `allow-open-url` has no URL scope).
    'opener:default',
    'deep-link:default',
    'store:default',
  ]
  if (options.autostart) permissions.push('autostart:default')
  if (options.updater) permissions.push('updater:default')
  return permissions
}

/**
 * The capability file `frigear-desktop sync` writes (it owns the whole file; add your own permissions in another one).
 * In local mode the window shows pages of the bundled server, a remote origin to Tauri: `remote.urls` lets those pages
 * use the same permissions. The sidecar is started from Rust, so no `shell:*` permission is granted to the pages.
 */
export function capabilities(options: Pick<ResolvedDesktopOptions, 'autostart' | 'updater'> & { local?: ResolvedDesktopOptions['local'] }): JsonObject {
  return {
    $schema: '../gen/schemas/desktop-schema.json',
    identifier: 'frigear',
    description: 'Generated by frigear-desktop sync from the desktop options in nuxt.config. Do not edit: add your own permissions in another capability file.',
    windows: [MAIN_WINDOW],
    platforms: ['macOS', 'windows', 'linux'],
    ...(options.local ? { remote: { urls: [LOCAL_ORIGIN_PATTERN] } } : {}),
    permissions: capabilityPermissions(options),
  }
}

/** The JavaScript Tauri packages the enabled features use, required ones first. */
export function usedPlugins(options: Pick<ResolvedDesktopOptions, 'autostart' | 'updater' | 'deepLinks'>, oauth: boolean): DesktopManifest['plugins'] {
  const plugins: DesktopManifest['plugins'] = [
    { name: '@tauri-apps/api', required: true, feature: TAURI_PLUGINS.window.feature },
  ]
  if (oauth || options.deepLinks.schemes.length) plugins.push({ name: TAURI_PLUGINS.deepLink.pkg, required: true, feature: TAURI_PLUGINS.deepLink.feature })
  plugins.push({ name: TAURI_PLUGINS.opener.pkg, required: oauth, feature: TAURI_PLUGINS.opener.feature })
  if (oauth) plugins.push({ name: TAURI_PLUGINS.store.pkg, required: false, feature: TAURI_PLUGINS.store.feature })
  if (options.autostart) plugins.push({ name: TAURI_PLUGINS.autostart.pkg, required: true, feature: TAURI_PLUGINS.autostart.feature })
  if (options.updater) plugins.push({ name: TAURI_PLUGINS.updater.pkg, required: true, feature: TAURI_PLUGINS.updater.feature })
  return plugins.sort((a, b) => Number(b.required) - Number(a.required))
}

const isObject = (value: unknown): value is JsonObject => !!value && typeof value === 'object' && !Array.isArray(value)

/** `source` over `target`: objects merge key by key, anything else (arrays included) replaces. */
function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
  const result: JsonObject = { ...target }
  for (const [key, value] of Object.entries(source)) {
    result[key] = isObject(value) && isObject(target[key]) ? deepMerge(target[key] as JsonObject, value) : value
  }
  return result
}

/**
 * Merges the owned parts (`tauriConfig()`) into the app's `tauri.conf.json`. Keys the module does not own stay as they
 * are; the owned window is merged into the window labelled `main` (else the first), other windows are left alone.
 * Merging twice gives the same result.
 */
export function mergeTauriConfig(existing: JsonObject, owned: JsonObject): JsonObject {
  const ownedApp = isObject(owned.app) ? owned.app : {}
  const { windows: ownedWindows, ...ownedAppRest } = ownedApp as { windows?: JsonObject[] }
  const merged = deepMerge(existing, { ...owned, app: ownedAppRest })
  const ownedWindow = ownedWindows?.[0]
  if (ownedWindow) {
    const app = (isObject(merged.app) ? merged.app : {}) as JsonObject
    const windows = Array.isArray(app.windows) ? [...app.windows as unknown[]] : []
    let index = windows.findIndex(window => isObject(window) && window.label === ownedWindow.label)
    if (index === -1) index = windows.findIndex(window => isObject(window) && window.label === undefined)
    if (index === -1) windows.unshift(ownedWindow)
    else windows[index] = deepMerge(windows[index] as JsonObject, ownedWindow)
    merged.app = { ...app, windows }
  }
  return merged
}

/** Stable JSON as the CLI writes it (two spaces, a final newline), so an unchanged merge leaves the file as it is. */
export const toJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
