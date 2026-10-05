import { reactive } from 'vue'
import type { NavigationItem } from '../../../types'

/**
 * Shared, module-scoped reactive state holding every registered navigation group's items, keyed
 * by group path (`''` for the root group). Deliberately not Nuxt's `useState` - items can carry
 * an `onClick` function, which isn't serializable into the SSR payload, so this is populated
 * client-side only (see `plugins/navigation.client.ts`).
 */
export const navigationGroups = reactive<Record<string, NavigationItem[]>>({})

export function pushNavigationItems(path: string, item: NavigationItem | NavigationItem[]) {
  const list = navigationGroups[path] ??= []
  list.push(...(Array.isArray(item) ? item : [item]))
}

/**
 * Empties every registered group's items in place, keeping the same reactive object/array
 * instances around rather than deleting keys, so each navigation file run starts from a clean
 * slate without accumulating duplicates across repeated runs (e.g. concurrent server requests).
 */
export function resetNavigationGroups() {
  for (const list of Object.values(navigationGroups)) list.length = 0
}
