// The parts of the Tauri JavaScript packages the module uses. Structural types, so the module type-checks and builds
// without the (optional) packages installed; `#desktop/native` only imports the installed ones.

/** `@tauri-apps/api/window`. Each call needs its `core:window:allow-*` permission (the generated capabilities have them). */
export interface TauriWindowLike {
  minimize(): Promise<void>
  maximize(): Promise<void>
  unmaximize(): Promise<void>
  toggleMaximize(): Promise<void>
  isMaximized(): Promise<boolean>
  close(): Promise<void>
  setFullscreen(fullscreen: boolean): Promise<void>
  isFullscreen(): Promise<boolean>
  setFocus(): Promise<void>
}

export interface TauriWindowModuleLike {
  getCurrentWindow(): TauriWindowLike
}

/** `@tauri-apps/api/app`. */
export interface TauriAppModuleLike {
  getVersion(): Promise<string>
  getName(): Promise<string>
}

/** `@tauri-apps/plugin-deep-link`. */
export interface DeepLinkPluginLike {
  getCurrent(): Promise<string[] | null>
  onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>
}

/** `@tauri-apps/plugin-opener`. */
export interface OpenerPluginLike {
  openUrl(url: string | URL, openWith?: string): Promise<void>
}

/** `@tauri-apps/plugin-store`. */
export interface StorePluginLike {
  load(path: string, options?: { defaults?: Record<string, unknown>, autoSave?: boolean | number }): Promise<{
    get<T>(key: string): Promise<T | undefined>
    set(key: string, value: unknown): Promise<void>
    delete(key: string): Promise<boolean>
    save(): Promise<void>
  }>
}

/** `@tauri-apps/plugin-autostart`. */
export interface AutostartPluginLike {
  enable(): Promise<void>
  disable(): Promise<void>
  isEnabled(): Promise<boolean>
}

/** `@tauri-apps/plugin-updater`. */
export interface UpdaterPluginLike {
  check(options?: Record<string, unknown>): Promise<{
    version: string
    currentVersion: string
    body?: string
    downloadAndInstall(onEvent?: (event: unknown) => void): Promise<void>
  } | null>
}

export type TauriPluginName = 'window' | 'app' | 'deepLink' | 'opener' | 'store' | 'autostart' | 'updater'

export interface TauriPlugins {
  window: TauriWindowModuleLike
  app: TauriAppModuleLike
  deepLink: DeepLinkPluginLike
  opener: OpenerPluginLike
  store: StorePluginLike
  autostart: AutostartPluginLike
  updater: UpdaterPluginLike
}

/** The package of each plugin (`pkg` is what must be installed, `specifier` what is imported) and what uses it. */
export const TAURI_PLUGINS: Record<TauriPluginName, { pkg: string, specifier: string, feature: string }> = {
  window: { pkg: '@tauri-apps/api', specifier: '@tauri-apps/api/window', feature: 'window controls (useDesktop) and focusing the window after sign-in' },
  app: { pkg: '@tauri-apps/api', specifier: '@tauri-apps/api/app', feature: 'the app version (useDesktop().getVersion)' },
  deepLink: { pkg: '@tauri-apps/plugin-deep-link', specifier: '@tauri-apps/plugin-deep-link', feature: 'deep links and the OAuth redirect' },
  opener: { pkg: '@tauri-apps/plugin-opener', specifier: '@tauri-apps/plugin-opener', feature: 'sign-in in the system browser and useDesktop().openExternal' },
  store: { pkg: '@tauri-apps/plugin-store', specifier: '@tauri-apps/plugin-store', feature: 'keeping the sign-in across restarts (@frigear-nu/auth)' },
  autostart: { pkg: '@tauri-apps/plugin-autostart', specifier: '@tauri-apps/plugin-autostart', feature: 'start at login (autostart)' },
  updater: { pkg: '@tauri-apps/plugin-updater', specifier: '@tauri-apps/plugin-updater', feature: 'updates (updater)' },
}

/** Whether the app runs in a Tauri v2 webview, without importing `@tauri-apps/api`. */
export function isTauri(scope: object = globalThis): boolean {
  const value = scope as { isTauri?: unknown, __TAURI_INTERNALS__?: unknown }
  return value.isTauri === true || (typeof value.__TAURI_INTERNALS__ === 'object' && value.__TAURI_INTERNALS__ !== null)
}

export type DesktopOs = 'macos' | 'windows' | 'linux' | 'unknown'

/** The OS from a user agent (the webviews report it: WKWebView, WebView2, WebKitGTK). */
export function detectOs(userAgent: string | undefined): DesktopOs {
  if (!userAgent) return 'unknown'
  if (/Windows/i.test(userAgent)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos'
  if (/Linux|X11/i.test(userAgent)) return 'linux'
  return 'unknown'
}
