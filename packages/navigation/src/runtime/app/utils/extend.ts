import type { NavigationItem } from '../../../types'
import { pushNavigationItems } from './state'

/**
 * Pushes one (or more) navigation item(s) into a named group, creating the group if it doesn't
 * exist yet. Group paths are free-form strings - `'account.menu'` is just a convention for
 * nesting, there's nothing magic about the dot. Auto-imported, so it can be called directly from
 * a module's `runtime/navigation.ts` file (see `defineNavigationFile`) or from app code.
 */
export function extendNavigationItem(path: string, item: NavigationItem | NavigationItem[]) {
  pushNavigationItems(path, item)
}
