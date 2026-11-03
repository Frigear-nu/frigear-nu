import type { MobileTabDefinition } from '../../types'

/** The subset of a `@frigear-nu/menu` item the bridge reads. */
export interface MenuItemLike {
  id?: string
  label: string
  labelKey?: string
  icon?: string
  to?: string
  order?: number
  meta?: Record<string, unknown>
}

const TAB_META = ['title', 'titleKey', 'activeIcon', 'sfSymbol', 'sfSymbolActive', 'androidIcon', 'requiresAuth', 'match', 'largeTitle'] as const

/**
 * Tabs from `useMenu('mobile.tabs')` items: `label`, `labelKey`, `icon`, `to`, `order` map over, the tab-only fields
 * come from `meta` (`meta.sfSymbol`, ...). Items without `to` are skipped.
 */
export function menuItemsToTabs(items: MenuItemLike[]): MobileTabDefinition[] {
  return items.filter(item => item.to).map((item) => {
    const tab: MobileTabDefinition = {
      id: item.id ?? (item.to!.split(/[?#]/)[0]!.replace(/^\/+|\/+$/g, '').replace(/[^\w.-]+/g, '-') || 'home'),
      to: item.to!,
      label: item.label,
      icon: item.icon ?? 'i-lucide-circle',
    }
    if (item.labelKey) tab.labelKey = item.labelKey
    if (item.order !== undefined) tab.order = item.order
    for (const key of TAB_META) {
      if (item.meta?.[key] !== undefined) (tab as unknown as Record<string, unknown>)[key] = item.meta[key]
    }
    return tab
  })
}
