import { createOAuthClient } from '../core/client'
import { webStorage } from '../core/storage'
import type { OAuthClient, OAuthClientOptions, TokenStorage } from '../core/types'
import { isTauri, systemBrowserUserAgent } from './adapters'
import type { OpenerPluginLike, SystemBrowserOptions } from './adapters'

export {
  isTauri,
  listenForDeepLinkCallbacks,
  loadTauriStoreStorage,
  systemBrowserUserAgent,
  TAURI_STORE_FILE,
  tauriStoreStorage,
} from './adapters'
export type {
  DeepLinkHandlers,
  DeepLinkPluginLike,
  OpenerPluginLike,
  StorePluginLike,
  SystemBrowserOptions,
  TauriStoreLike,
  TauriWindowModuleLike,
} from './adapters'

// For Tauri v2 apps without the Nuxt module. Unlike `@frigear-nu/auth/capacitor` the plugins are passed in, so this
// entry imports no `@tauri-apps/*` package:
//
//   import { openUrl } from '@tauri-apps/plugin-opener'
//   import * as deepLink from '@tauri-apps/plugin-deep-link'
//   import * as store from '@tauri-apps/plugin-store'
//   const client = createTauriOAuthClient({ ..., opener: { openUrl }, storage: await loadTauriStoreStorage(store) })
//   await listenForDeepLinkCallbacks(deepLink, { isCallbackUrl: client.isCallbackUrl, onCallback: url => client.handleCallback(url) })

export interface TauriClientOptions extends Omit<OAuthClientOptions, 'userAgent' | 'storage'> {
  /** `@tauri-apps/plugin-opener` (`{ openUrl }`). */
  opener: OpenerPluginLike
  /** How a return to the app is noticed, see `systemBrowserUserAgent`. */
  browser?: SystemBrowserOptions
  /** E.g. `await loadTauriStoreStorage(store)` (not encrypted). Default: `localStorage`. */
  storage?: TokenStorage
}

/**
 * `createOAuthClient` for a Tauri app: the system browser and a custom-scheme redirect URI (`redirectUri`), whose
 * callbacks `listenForDeepLinkCallbacks` hands over. Outside Tauri (the frontend in a plain browser) it falls back to a
 * same-window redirect, so `redirectUri` must then be a web one.
 */
export function createTauriOAuthClient(options: TauriClientOptions): OAuthClient {
  const { opener, browser, storage, ...rest } = options
  const tokens = storage ?? webStorage()
  if (!isTauri()) return createOAuthClient({ ...rest, storage: tokens })
  return createOAuthClient({ ...rest, storage: tokens, userAgent: systemBrowserUserAgent(opener, browser) })
}
