import type { MenuItem } from '../../../types'
import { parseMenuPath } from '../../utils/menu'
import { currentMenuStore, pushMenuItems } from './state'

/**
 * Pushes one (or more) item(s) into a menu's group, creating both if they don't exist yet. Paths
 * are addressed as `menu` (root group) or `menu.group` (parsed on the first dot only - e.g.
 * `'dashboard.more'` is menu `dashboard`, group `more`). Auto-imported, so it can be called
 * directly from a module's `runtime/menus.ts` source (see `defineMenuSource`) or from app code.
 */
export function extendMenuItem(path: string, item: MenuItem | MenuItem[]): void {
  const { menu, group, wildcard } = parseMenuPath(path)
  if (wildcard) {
    throw new Error(`[@frigear-nu/menu] Cannot register items into wildcard path "${path}" - wildcards are only supported when reading a menu via \`useMenu\`.`)
  }
  pushMenuItems(currentMenuStore(), menu, group, item)
}
