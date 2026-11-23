import type { AuthorizationUserAgent, TokenStorage } from '../core/types'
import type { AppUrlHandlers } from '../capacitor/adapters'

// The Tauri v2 counterparts of the Capacitor adapters. They take the plugins as arguments, so the Nuxt runtime can load
// them lazily (only when installed) and tests can pass fakes; nothing here imports a `@tauri-apps/*` package.

/** The parts of `@tauri-apps/plugin-opener` the user agent needs. */
export interface OpenerPluginLike {
  openUrl(url: string | URL, openWith?: string): Promise<void>
}

/** The parts of `@tauri-apps/plugin-deep-link` sign-in needs. */
export interface DeepLinkPluginLike {
  /** The URLs the app was started with (cold start), for the lifetime of the process. */
  getCurrent(): Promise<string[] | null>
  /** Resolves to an unlisten function. */
  onOpenUrl(handler: (urls: string[]) => void): Promise<() => void>
}

/** A store of `@tauri-apps/plugin-store` (`await load('auth.json')`). */
export interface TauriStoreLike {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
  save(): Promise<void>
}

/** `@tauri-apps/plugin-store`. */
export interface StorePluginLike {
  load(path: string, options?: { defaults?: Record<string, unknown>, autoSave?: boolean | number }): Promise<TauriStoreLike>
}

/**
 * `@tauri-apps/api/window`, to bring the window back once a callback arrived. `setFocus` needs the
 * `core:window:allow-set-focus` permission in the app's capabilities.
 */
export interface TauriWindowModuleLike {
  getCurrentWindow(): { setFocus(): Promise<void> }
}

/** The store file of the tokens and the pending authorization, in the app's data directory. */
export const TAURI_STORE_FILE = 'auth.json'

/** Whether the app runs in a Tauri v2 webview, without importing `@tauri-apps/api`. */
export const isTauri = (): boolean => {
  const scope = globalThis as { isTauri?: unknown, __TAURI_INTERNALS__?: unknown }
  return scope.isTauri === true || (typeof scope.__TAURI_INTERNALS__ === 'object' && scope.__TAURI_INTERNALS__ !== null)
}

/**
 * Tokens in a `@tauri-apps/plugin-store` file (JSON in the app's data directory). **Not encrypted**: any process
 * running as the user can read it, as with `localStorage`. Every write is saved to disk at once, so a crash does not
 * lose a rotated refresh token.
 */
export const tauriStoreStorage = (store: TauriStoreLike): TokenStorage => ({
  async get(key) {
    const value = await store.get<unknown>(key)
    return typeof value === 'string' ? value : null
  },
  async set(key, value) {
    await store.set(key, value)
    await store.save()
  },
  async remove(key) {
    if (await store.delete(key)) await store.save()
  },
})

/** Loads the store file (`auth.json`) and wraps it in `tauriStoreStorage`. */
export async function loadTauriStoreStorage(plugin: StorePluginLike, path = TAURI_STORE_FILE): Promise<TokenStorage> {
  return tauriStoreStorage(await plugin.load(path, { defaults: {}, autoSave: false }))
}

export interface SystemBrowserOptions {
  /**
   * Calls `listener` when the user comes back to the app; returns an unsubscribe. Default: the window's `focus` event.
   * `false` never reports a dismissal.
   */
  onReturn?: ((listener: () => void) => () => void) | false
}

const windowFocus = (listener: () => void) => {
  const target = globalThis as { addEventListener?: Window['addEventListener'], removeEventListener?: Window['removeEventListener'] }
  if (typeof target.addEventListener !== 'function') return () => undefined
  target.addEventListener('focus', listener)
  return () => target.removeEventListener?.('focus', listener)
}

/**
 * The user's default browser (`@tauri-apps/plugin-opener`), so their web session, password manager and passkeys work.
 * The redirect comes back as a deep link (`listenForDeepLinkCallbacks`).
 *
 * A system browser tells the app nothing about being closed and cannot be closed by it: `close()` is a no-op. So that
 * an abandoned sign-in does not leave `signingIn` on (and the sign-in button disabled) for good, coming back to the
 * app counts as a dismissal (`onReturn`, the window's `focus` by default). The pending authorization stays stored, so a
 * redirect that arrives later still completes, and a new sign-in starts a second pending authorization next to it.
 */
export const systemBrowserUserAgent = (opener: OpenerPluginLike, options: SystemBrowserOptions = {}): AuthorizationUserAgent => {
  const onReturn = options.onReturn === undefined ? windowFocus : options.onReturn
  let stopWatching: (() => void) | undefined
  const stop = () => {
    stopWatching?.()
    stopWatching = undefined
  }
  return {
    async open(url, { onDismissed }) {
      stop()
      await opener.openUrl(url)
      // Only after the browser is open: opening it takes the focus away, coming back gives it back.
      if (onReturn && onDismissed) {
        const unsubscribe = onReturn(() => {
          stop()
          onDismissed()
        })
        stopWatching = unsubscribe
      }
    },
    async close() {
      stop()
    },
  }
}

export interface DeepLinkHandlers extends Omit<AppUrlHandlers, 'onResume'> {
  /** Brings the window to the front once a callback arrived (the browser has the focus), e.g. `getCurrentWindow().setFocus()`. */
  focus?: () => void | Promise<void>
}

/**
 * Hands OAuth callbacks to `onCallback`: the URLs the app was cold-started with (`getCurrent`) and every `onOpenUrl`
 * after that, each URL once, as `listenForCallbacks` does for Capacitor. Other URLs are ignored. Returns an
 * unsubscribe.
 */
export async function listenForDeepLinkCallbacks(deepLink: DeepLinkPluginLike, handlers: DeepLinkHandlers): Promise<() => void> {
  const seen = new Set<string>()
  const handle = (url: string | undefined) => {
    if (!url || seen.has(url) || !handlers.isCallbackUrl(url)) return
    seen.add(url)
    if (handlers.focus) void Promise.resolve().then(handlers.focus).catch(() => undefined)
    void handlers.onCallback(url)
  }
  const unlisten = await deepLink.onOpenUrl(urls => urls.forEach(handle))
  const launchUrls = (await deepLink.getCurrent().catch(() => null)) ?? []
  for (const url of launchUrls) {
    // `getCurrent()` keeps returning the cold-start URLs after a webview reload: only the first load handles them.
    if (!handlers.isCallbackUrl(url) || handlers.launchUrlStore?.get() === url) continue
    handlers.launchUrlStore?.set(url)
    handle(url)
  }
  return unlisten
}
