import type { NavigationMenuItem } from '@nuxt/ui'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { NavLinkSource, NavLinksOptions } from '../types'
import { useLocaleLink } from './useLocaleLink'

/**
 * Turns menu items (e.g. `useMenu('admin.nav')`) into `UNavigationMenu` links: `to` gets the active locale's prefix
 * and `active` follows the current route (prefix-insensitive; targets listed in `exact` only match exactly).
 *
 * ```ts
 * const { data } = await useMenu('account')
 * const links = useNavLinks(() => data.value ?? [], { exact: ['/account'] })
 * ```
 */
export function useNavLinks(items: MaybeRefOrGetter<NavLinkSource[] | null | undefined>, options: NavLinksOptions = {}): ComputedRef<NavigationMenuItem[]> {
  const { localize, isActive, strip } = useLocaleLink()
  const exact = new Set((options.exact ?? []).map(path => strip(path)))

  return computed(() => (toValue(items) ?? []).map((item) => {
    const link: NavigationMenuItem = { label: item.label, icon: item.icon }
    if (item.badge !== undefined) link.badge = item.badge
    if (item.to) {
      link.to = item.external ? item.to : localize(item.to)
      link.external = item.external
      link.active = !item.external && isActive(item.to, { exact: exact.has(strip(item.to)) })
    }
    return link
  }))
}
