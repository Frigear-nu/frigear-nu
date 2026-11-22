import type { NavigationMenuItem } from '@nuxt/ui'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { NavLinkSource, NavLinksOptions } from '../types'
import { useLocaleLink } from './useLocaleLink'
import { computed, toValue } from '#imports'

/**
 * Turns menu items (e.g. `useMenu('admin.nav')`) into `UNavigationMenu` links: `to` gets the active locale's prefix
 * and `active` follows the current route (prefix-insensitive; targets listed in `exact` only match exactly). When
 * several links match, only the most specific one is active: on `/admin/help-center/faq`, a link to
 * `/admin/help-center/faq` wins over one to `/admin/help-center`.
 *
 * ```ts
 * const { data } = await useMenu('account')
 * const links = useNavLinks(() => data.value ?? [], { exact: ['/account'] })
 * ```
 */
export function useNavLinks(items: MaybeRefOrGetter<NavLinkSource[] | null | undefined>, options: NavLinksOptions = {}): ComputedRef<NavigationMenuItem[]> {
  const { localize, isActive, strip } = useLocaleLink()
  const exact = new Set((options.exact ?? []).map(path => strip(path)))

  return computed(() => {
    const sources = toValue(items) ?? []
    const matches = sources.map(item => !!item.to && !item.external && isActive(item.to, { exact: exact.has(strip(item.to)) }))
    const longest = Math.max(-1, ...sources.map((item, index) => matches[index] ? strip(item.to!).length : -1))
    return sources.map((item, index) => {
      const link: NavigationMenuItem = { label: item.label, icon: item.icon }
      if (item.badge !== undefined) link.badge = item.badge
      if (item.to) {
        link.to = item.external ? item.to : localize(item.to)
        link.external = item.external
        link.active = matches[index] === true && strip(item.to).length === longest
      }
      return link
    })
  })
}
