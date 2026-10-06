import { reactive } from 'vue'
import type { MenuItem } from '../../../types'

/**
 * Shared, module-scoped reactive state holding every menu's items, keyed by menu name then by
 * group (`''` for the root group). Populated client-side (and once per SSR request) by the
 * `menus` plugin, which runs every registered dynamic source.
 */
export const menus = reactive<Record<string, Record<string, MenuItem[]>>>({})

export function pushMenuItems(menu: string, group: string, items: MenuItem | MenuItem[]): void {
  const groups = menus[menu] ??= {}
  const list = groups[group] ??= []
  list.push(...(Array.isArray(items) ? items : [items]))
}

/**
 * Empties every registered menu/group's items in place, keeping the same reactive object/array
 * instances around rather than deleting keys, so each source run starts from a clean slate
 * without accumulating duplicates across repeated runs (e.g. concurrent server requests).
 */
export function resetMenus(): void {
  for (const groups of Object.values(menus)) {
    for (const list of Object.values(groups)) list.length = 0
  }
}
