import type { TokenStorage } from './types'

/** Lost on reload. The default, and what tests use. */
export const memoryStorage = (): TokenStorage => {
  const map = new Map<string, string>()
  return {
    get: async key => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    remove: async key => void map.delete(key),
  }
}

/**
 * `localStorage` (default) or `sessionStorage`. Pass a getter to read it lazily, so the adapter can be created where
 * there is no `window` (SSR).
 */
export const webStorage = (storage: Storage | (() => Storage) = () => globalThis.localStorage): TokenStorage => {
  const resolve = () => typeof storage === 'function' ? storage() : storage
  return {
    get: async key => resolve().getItem(key),
    set: async (key, value) => resolve().setItem(key, value),
    remove: async key => resolve().removeItem(key),
  }
}

/** The storage keys a client uses, e.g. to wipe them. */
export const storageKeys = (prefix: string) => ({
  tokens: `${prefix}tokens`,
  pending: `${prefix}pending`,
})

/** The default key prefix of a client. */
export const defaultStorageKeyPrefix = (clientId: string) => `oauth:${clientId}:`
