import { reactive } from 'vue'
import type { MenuItem } from '../../../types'

/** Every menu's items, keyed by menu name then by group (`''` for the root group). */
export type MenuStore = Record<string, Record<string, MenuItem[]>>

export function createMenuStore(): MenuStore {
  return reactive<MenuStore>({})
}

/**
 * Process-wide store, used only when no Nuxt app is in scope: the Nitro `useMenu` (populated once per
 * process from the runtime config) and calls made outside an app context. It is never read by the
 * Vue renderer, which uses the per-app store below.
 */
export const processMenuStore: MenuStore = createMenuStore()

// One store per Nuxt app instance (server: one per request, client: one). Keyed by the app rather
// than held in module scope, because concurrent SSR renders (e.g. on Cloudflare Workers) share the
// module and would otherwise reset and fill each other's menus.
const appStores = new WeakMap<object, MenuStore>()

export function getAppMenuStore(nuxtApp: object): MenuStore {
  let store = appStores.get(nuxtApp)
  if (!store) appStores.set(nuxtApp, store = createMenuStore())
  return store
}

// Registered by the `menus` plugin (the only code that is part of the Vue app bundle), so that
// `extendMenuItem` can find the current app's store without importing Nuxt's app runtime - it is also
// loaded by the Nitro bundle, where `#imports` has no `tryUseNuxtApp`.
let resolveAppStore: (() => MenuStore | undefined) | undefined

export function setAppMenuStoreResolver(resolver: () => MenuStore | undefined): void {
  resolveAppStore = resolver
}

/** The store of the Nuxt app currently in scope, or the process-wide store outside any app. */
export function currentMenuStore(): MenuStore {
  return resolveAppStore?.() ?? processMenuStore
}

export function pushMenuItems(store: MenuStore, menu: string, group: string, items: MenuItem | MenuItem[]): void {
  const groups = store[menu] ??= {}
  const list = groups[group] ??= []
  list.push(...(Array.isArray(items) ? items : [items]))
}

/** Empties every registered menu/group's items in place, so a (re)population never accumulates duplicates. */
export function resetMenus(store: MenuStore): void {
  for (const groups of Object.values(store)) {
    for (const list of Object.values(groups)) list.length = 0
  }
}
