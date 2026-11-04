import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { createOAuthClient } from '../core/client'
import { defaultStorageKeyPrefix, storageKeys, webStorage } from '../core/storage'
import type { OAuthClient, OAuthClientOptions, TokenStorage } from '../core/types'
import {
  browserUserAgent,
  listenForCallbacks,
  preferencesStorage,
  secureStorage,
  withInstallMarker,
} from './adapters'
import type { AppUrlHandlers, SecureStoragePluginLike } from './adapters'

export {
  browserUserAgent,
  isNativePlatform,
  listenForCallbacks,
  preferencesStorage,
  secureStorage,
  withInstallMarker,
} from './adapters'
export type {
  AppPluginLike,
  AppUrlHandlers,
  BrowserPluginLike,
  PreferencesPluginLike,
  SecureStoragePluginLike,
} from './adapters'

// Wiring of the adapters to the real plugins, for apps without the Nuxt module. Install `@capacitor/core`,
// `@capacitor/app`, `@capacitor/browser` and `@capacitor/preferences`.

/** `@capacitor/browser`. */
export const capacitorUserAgent = () => browserUserAgent(Browser)

/** `@capacitor/preferences`. */
export const capacitorPreferences = () => preferencesStorage(Preferences)

/** Callback URLs (cold start and `appUrlOpen`) of `@capacitor/app`. */
export const onCapacitorCallback = (handlers: AppUrlHandlers) => listenForCallbacks(App, handlers)

export interface CapacitorClientOptions extends Omit<OAuthClientOptions, 'userAgent' | 'storage' | 'transientStorage'> {
  /**
   * The Keychain/Keystore plugin, e.g. `SecureStorage` of `@aparajita/capacitor-secure-storage`. Without it the
   * tokens are kept in Preferences (not encrypted). Ignored in a browser, which uses `localStorage`.
   */
  secureStorage?: SecureStoragePluginLike
  /** Replaces the token storage altogether. */
  storage?: TokenStorage
}

/**
 * `createOAuthClient` for a Capacitor app: the in-app browser, Keychain/Keystore tokens (Preferences without a secure
 * storage plugin) with an install marker, and the pending authorization in Preferences. In a browser (`cap run` web,
 * `vite dev`) it falls back to a redirect and `localStorage`.
 */
export function createCapacitorOAuthClient(options: CapacitorClientOptions): OAuthClient {
  const native = Capacitor.isNativePlatform()
  const { secureStorage: plugin, storage: custom, ...rest } = options
  if (!native) return createOAuthClient({ ...rest, storage: custom ?? webStorage() })

  const prefix = options.storageKeyPrefix ?? defaultStorageKeyPrefix(options.clientId)
  const preferences = preferencesStorage(Preferences)
  const storage = custom ?? (plugin
    ? withInstallMarker(secureStorage(plugin), { marker: preferences, keys: [storageKeys(prefix).tokens], markerKey: `${prefix}installed` })
    : preferences)
  return createOAuthClient({ ...rest, storage, transientStorage: preferences, userAgent: browserUserAgent(Browser) })
}
