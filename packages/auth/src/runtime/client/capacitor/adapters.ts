import type { AuthorizationUserAgent, TokenStorage } from '../core/types'

// The adapters take the plugins as arguments, so the Nuxt runtime can load them lazily (only when installed) and
// tests can pass fakes. `@frigear-nu/auth/capacitor` wires them to the real plugins.

interface ListenerHandle {
  remove(): Promise<void>
}

/** The parts of `@capacitor/browser` the user agent needs. */
export interface BrowserPluginLike {
  open(options: { url: string, presentationStyle?: 'fullscreen' | 'popover' }): Promise<void>
  close(): Promise<void>
  addListener(eventName: 'browserFinished', listener: () => void): Promise<ListenerHandle>
}

/** The parts of `@capacitor/app` sign-in needs. */
export interface AppPluginLike {
  getLaunchUrl(): Promise<{ url: string } | undefined>
  addListener(eventName: 'appUrlOpen', listener: (event: { url: string }) => void): Promise<ListenerHandle>
  addListener(eventName: 'resume', listener: () => void): Promise<ListenerHandle>
}

/** `@capacitor/preferences`. */
export interface PreferencesPluginLike {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string, value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

/**
 * `@aparajita/capacitor-secure-storage`. Its `get`/`set`/`remove` are a pair: `set` stores `JSON.stringify(data)` and
 * `get` parses it back, while `getItem`/`setItem` store raw strings. Mixing the two would read tokens back as a JSON
 * string literal, so only the first pair is used.
 */
export interface SecureStoragePluginLike {
  get(key: string, convertDate?: boolean, sync?: boolean): Promise<unknown>
  set(key: string, data: string, convertDate?: boolean, sync?: boolean, access?: number): Promise<void>
  remove(key: string, sync?: boolean): Promise<boolean>
}

/** `window.Capacitor`, without importing `@capacitor/core`. */
export const isNativePlatform = (): boolean => {
  const capacitor = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform()
}

/**
 * UserDefaults / SharedPreferences. Not encrypted: use it for the pending authorization, or for tokens only when no
 * secure storage plugin can be installed.
 */
export const preferencesStorage = (preferences: PreferencesPluginLike): TokenStorage => ({
  get: async key => (await preferences.get({ key })).value ?? null,
  set: (key, value) => preferences.set({ key, value }),
  remove: key => preferences.remove({ key }),
})

/** iOS `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`: readable on `resume` after the first unlock, never backed up to another device. */
const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 3

/** Keychain (iOS) / Keystore-encrypted storage (Android) through `@aparajita/capacitor-secure-storage`. */
export const secureStorage = (plugin: SecureStoragePluginLike): TokenStorage => ({
  async get(key) {
    const value = await plugin.get(key, false, false)
    return typeof value === 'string' ? value : null
  },
  // Not synced to iCloud Keychain, and only on this device.
  set: (key, value) => plugin.set(key, value, false, false, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY),
  async remove(key) {
    await plugin.remove(key, false)
  },
})

/**
 * Keychain items survive uninstalling an iOS app; UserDefaults do not. The first time the storage is used after an
 * install (no `markerKey` in `marker`), `keys` are wiped from `storage`, so a reinstalled app starts signed out
 * instead of silently reusing a stale refresh token.
 */
export const withInstallMarker = (
  storage: TokenStorage,
  options: { marker: TokenStorage, keys: string[], markerKey?: string },
): TokenStorage => {
  // The key is stored on devices: renaming it would sign every installed app out once.
  const markerKey = options.markerKey ?? 'oauth-client:installed'
  let ready: Promise<void> | undefined
  const ensure = () => (ready ??= (async () => {
    if (await options.marker.get(markerKey)) return
    for (const key of options.keys) await storage.remove(key)
    await options.marker.set(markerKey, String(Date.now()))
  })().catch((error) => {
    ready = undefined
    throw error
  }))
  return {
    get: async key => (await ensure(), storage.get(key)),
    set: async (key, value) => (await ensure(), storage.set(key, value)),
    remove: async key => (await ensure(), storage.remove(key)),
  }
}

/**
 * The in-app browser (SFSafariViewController / Chrome Custom Tabs), so the user's web session and passkeys work.
 * `onDismissed` runs once when the user closes it (Done, swipe down) before the app closes it with `close()`.
 */
export const browserUserAgent = (browser: BrowserPluginLike): AuthorizationUserAgent => {
  /** Removes the `browserFinished` listener of the sign-in that is open, if any. */
  let stopWatchingBrowser: (() => Promise<void>) | undefined
  return {
    async open(url, { onDismissed }) {
      await stopWatchingBrowser?.()
      const listener = await browser.addListener('browserFinished', () => {
        void stop()
        onDismissed?.()
      })
      const stop = async () => {
        if (stopWatchingBrowser === stop) stopWatchingBrowser = undefined
        await listener.remove()
      }
      stopWatchingBrowser = stop
      try {
        await browser.open({ url, presentationStyle: 'popover' })
      }
      catch (error) {
        await stop()
        throw error
      }
    },
    async close() {
      await stopWatchingBrowser?.()
      await browser.close().catch(() => undefined)
    },
  }
}

export interface AppUrlHandlers {
  /** Whether a URL is an OAuth callback (`client.isCallbackUrl`). Other URLs (deep links) are ignored. */
  isCallbackUrl: (url: string) => boolean
  onCallback: (url: string) => void | Promise<void>
  /** Called when the app returns to the foreground. */
  onResume?: () => void | Promise<void>
  /**
   * Remembers the cold-start URL across webview reloads (`sessionStorage`), since `getLaunchUrl()` keeps returning
   * it for the lifetime of the process.
   */
  launchUrlStore?: { get(): string | null, set(url: string): void }
}

/**
 * Hands OAuth callbacks to `onCallback`: the URL the app was cold-started with (`getLaunchUrl`) and every
 * `appUrlOpen` after that, each URL once. Returns an unsubscribe.
 */
export async function listenForCallbacks(app: AppPluginLike, handlers: AppUrlHandlers): Promise<() => void> {
  const seen = new Set<string>()
  const handle = (url: string | undefined) => {
    if (!url || seen.has(url) || !handlers.isCallbackUrl(url)) return
    seen.add(url)
    void handlers.onCallback(url)
  }
  const listeners = [await app.addListener('appUrlOpen', event => handle(event.url))]
  if (handlers.onResume) {
    const onResume = handlers.onResume
    listeners.push(await app.addListener('resume', () => void onResume()))
  }
  const launchUrl = (await app.getLaunchUrl().catch(() => undefined))?.url
  if (launchUrl && handlers.launchUrlStore?.get() !== launchUrl) {
    handlers.launchUrlStore?.set(launchUrl)
    handle(launchUrl)
  }
  return () => listeners.forEach(listener => void listener.remove())
}

/**
 * The plugin as a promise can resolve to. A Capacitor plugin is a proxy with a method for every property, `then`
 * included, so a promise resolved with it calls the native `then()`, which rejects as not implemented, and never
 * settles: the app would wait for it forever. The generated loaders wrap every plugin in this.
 */
export function withoutThen<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get: (target, key, receiver) => (key === 'then' ? undefined : Reflect.get(target, key, receiver)),
  })
}
