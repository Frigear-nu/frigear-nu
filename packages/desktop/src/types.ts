/**
 * How the desktop app gets its pages.
 *
 * - `remote`: a static SPA (`nuxt generate`) bundled in the Tauri app, talking to a remote API and signing in at a
 *   remote issuer (`@frigear-nu/auth` in client mode).
 * - `local`: the whole Nuxt app (pages, SSR and its server modules) built into one executable that the Tauri shell starts
 *   as a sidecar on `127.0.0.1`. Offline: sqlite in the OS app-data folder, cookie sessions (`@frigear-nu/auth` in
 *   server mode) on the same origin, or sign-in at a remote issuer whose access tokens the server accepts
 *   (`@frigear-nu/auth` in resource mode).
 */
export type DesktopMode = 'remote' | 'local'

/** The main window (`app.windows[0]` of `tauri.conf.json`, label `main`). */
export interface DesktopWindowOptions {
  /** Default: `appName`. */
  title?: string
  /** Default `1280`. */
  width?: number
  /** Default `800`. */
  height?: number
  minWidth?: number
  minHeight?: number
  /** Default `true`. */
  resizable?: boolean
  /** Default `false`. */
  fullscreen?: boolean
  /** Fullscreen, without decorations, not resizable: a single-purpose screen (a check-in desk). Default `false`. */
  kiosk?: boolean
  /** The OS title bar and borders. Default `true`. */
  decorations?: boolean
  /** Centered on the screen at start. Default `true`. */
  center?: boolean
}

export interface DesktopUpdaterOptions {
  /** Update manifest URLs (`{{target}}`, `{{arch}}` and `{{current_version}}` are filled in by Tauri). */
  endpoints: string[]
  /** The public key of `tauri signer generate` (the contents, not a path). */
  pubkey: string
}

/** `local` mode: the bundled server. */
export interface DesktopLocalOptions {
  /**
   * The sidecar's name: `src-tauri/binaries/<binaryName>-<target triple>` and Tauri's `bundle.externalBin`. Default:
   * `<last segment of appId>-server`.
   */
  binaryName?: string
  /** The port the server listens on. Default `0`: a free port the OS picks, read back from the `READY <port>` line. */
  port?: number
  /**
   * Keep the session cookie `Secure`. Default `false`: WKWebView (macOS) and WebKitGTK (Linux) drop a `Secure` cookie
   * set over `http://127.0.0.1`, so nobody could stay signed in. The server only listens on `127.0.0.1`, so the cookie
   * never crosses a network. Set `true` only for a Windows-only app (WebView2). Ignored with
   * `authentication.mode: 'resource'`, which has no session cookie.
   */
  secureCookie?: boolean
  /** The folder inside the OS app-data folder (`app_data_dir()`) that holds the database and the secrets. Default `data`. */
  dataDirName?: string
}

export interface ModuleOptions {
  /**
   * Reverse-DNS app id (`nu.frigear.crew`): the Tauri `identifier` and, lowercased, the default deep-link scheme and
   * `authentication.client.native.scheme`. Required.
   */
  appId?: string
  /** The product name (window title, bundle name). Default: `appId`. */
  appName?: string
  /** The app version (semver). Default: the app's `package.json` version, else `0.1.0`. */
  version?: string
  /** Default `remote`. */
  mode?: DesktopMode
  /**
   * Build a static SPA (`ssr: false`). Default `true` in remote mode, which needs it unless you set up SSR output
   * yourself, and `false` in local mode, where the bundled server renders the pages. Local mode with
   * `authentication.mode: 'resource'` renders on the client only: `true`, and the bundled server serves the SPA shell.
   */
  spa?: boolean
  /** `local` mode: the bundled server. Ignored in remote mode. */
  local?: DesktopLocalOptions
  window?: DesktopWindowOptions
  /** Deep links routed into the app (OAuth callbacks are always left to `@frigear-nu/auth`). */
  deepLinks?: {
    /** Custom schemes the OS opens the app with. Default: the app id, lowercased. `false`: none. */
    schemes?: string[] | false
  }
  /**
   * One running instance: a second launch (and every deep link on Windows and Linux) goes to the running app. Default
   * `true`; sign-in through the system browser needs it on Windows and Linux.
   */
  singleInstance?: boolean
  /** `tauri-plugin-autostart` (start at login, managed from the app). Default `false`. */
  autostart?: boolean
  /** `tauri-plugin-updater`. Off by default. */
  updater?: DesktopUpdaterOptions | false
  /** The URL the window loads under `tauri dev`. Default: `http://localhost:<devServer.port>` (3000). */
  devUrl?: string
  /** Warnings on dev / build start about missing Tauri plugins. Default `true`. */
  doctor?: boolean
}

/** The options after normalization. */
export interface ResolvedDesktopOptions {
  appId: string
  appName: string
  version: string
  mode: DesktopMode
  spa: boolean
  window: Required<Omit<DesktopWindowOptions, 'minWidth' | 'minHeight' | 'kiosk'>> & Pick<DesktopWindowOptions, 'minWidth' | 'minHeight'>
  deepLinks: { schemes: string[] }
  singleInstance: boolean
  autostart: boolean
  updater: DesktopUpdaterOptions | false
  devUrl: string
  /** `null` in remote mode. */
  local: ResolvedDesktopLocalOptions | null
}

export type ResolvedDesktopLocalOptions = Required<DesktopLocalOptions>

/** `runtimeConfig.public.desktop`. */
export interface DesktopPublicConfig {
  appId: string
  appName: string
  version: string
  mode: DesktopMode
  /**
   * `focusPath`: a deep-link path that only brings the window forward (`/auth/return` in local mode with server auth,
   * the return link of Auth's frigear handoff); empty otherwise.
   */
  deepLinks: { schemes: string[], focusPath: string }
}

/** What the module writes to `.nuxt/desktop/manifest.json` for the `frigear-desktop` CLI. */
export interface DesktopManifest {
  appId: string
  appName: string
  version: string
  mode: DesktopMode
  devUrl: string
  /** The OAuth redirect URI of a production build, when the app signs in. */
  redirectUri: string
  schemes: string[]
  singleInstance: boolean
  autostart: boolean
  updater: boolean
  /** JavaScript Tauri plugins the enabled features use. */
  plugins: { name: string, required: boolean, feature: string }[]
  /** The bundled server of local mode, `null` in remote mode. */
  local: Pick<ResolvedDesktopLocalOptions, 'binaryName' | 'port' | 'dataDirName'> | null
}

export interface DesktopDeepLinkContext {
  url: string
  /** The app path the link resolved to. Change it to route elsewhere. */
  path: string
  /** Call to handle the link yourself (no navigation). */
  preventDefault: () => void
}
