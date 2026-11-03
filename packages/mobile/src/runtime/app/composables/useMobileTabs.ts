import { computed, useRuntimeConfig } from '#imports'
import { tabs as registered } from '#mobile/tabs'
import { useMenu } from '#mobile/optional'
import type { MobileTab } from '../../../types'
import { menuItemsToTabs, type MenuItemLike } from '../../shared/menu'
import { normalizeTabs } from '../../shared/tabs'
import { useMobileTranslate } from '../utils/translate'

/**
 * Every tab of the app: `mobile.tabs`, the tabs modules added with `extendMobileTabs()` and, with `@frigear-nu/menu`,
 * the items of the `mobile.tabs` menu (which replace tabs of the same id). Labels and titles translated.
 */
export function useMobileTabs() {
  const config = useRuntimeConfig().public.mobile
  const translate = useMobileTranslate()
  const menu = typeof useMenu === 'function' ? useMenu('mobile.tabs') : undefined

  const tabs = computed<MobileTab[]>(() => {
    const items = (menu?.data.value ?? []) as MenuItemLike[]
    if (!items.length) return registered
    // Invalid menu entries are dropped rather than failing the page.
    return normalizeTabs([...registered.map(({ match, ...tab }) => ({ ...tab, match })), ...menuItemsToTabs(items)], { auth: config.auth }).tabs
  })

  return {
    tabs,
    label: (tab: MobileTab) => translate(tab.labelKey, tab.label),
    title: (tab: MobileTab) => translate(tab.titleKey, tab.title ?? translate(tab.labelKey, tab.label)),
  }
}
