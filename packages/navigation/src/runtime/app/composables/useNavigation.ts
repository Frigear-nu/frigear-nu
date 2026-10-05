import { computed } from 'vue'
import { navigationGroups } from '../utils/state'

/**
 * Reads a navigation group's items, sorted by `order` (ascending, undefined last - in
 * registration order). Defaults to the root group (the array passed directly into every
 * `defineNavigationFile` callback).
 *
 * ```ts
 * const tiles = useNavigation('account.menu')
 * ```
 */
export const useNavigation = (group = '') => {
  return computed(() => {
    const items = navigationGroups[group] ?? []
    return [...items].sort((a, b) => {
      if (a.order === undefined && b.order === undefined) return 0
      if (a.order === undefined) return 1
      if (b.order === undefined) return -1
      return a.order - b.order
    })
  })
}
