/**
 * How the desktop app gets its pages.
 *
 * - `remote`: a static SPA (`nuxt generate`) bundled in the Tauri app, talking to a remote API and signing in at a
 *   remote issuer (`@frigear-nu/auth` in client mode).
 * - `local`: reserved for a Nitro server bundled as a sidecar on `127.0.0.1`. Not implemented yet: the module throws.
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
  /** Default `remote`. `local` is not implemented yet. */
  mode?: DesktopMode
  /** Build a static SPA (`ssr: false`). Default `true`; remote mode needs it unless you set up SSR output yourself. */
  spa?: boolean
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
}

/** `runtimeConfig.public.desktop`. */
export interface DesktopPublicConfig {
  appId: string
  appName: string
  version: string
  mode: DesktopMode
  deepLinks: { schemes: string[] }
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
}

export interface DesktopDeepLinkContext {
  url: string
  /** The app path the link resolved to. Change it to route elsewhere. */
  path: string
  /** Call to handle the link yourself (no navigation). */
  preventDefault: () => void
}
