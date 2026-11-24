import type { MenuItem } from '@frigear-nu/menu'
import { computed, useLocaleLink, useModuleT, useNavLinks, useRuntimeConfig } from '#imports'
import { useMenu } from '#dashboard/optional'

/** An entry of the hub navigation: an item of the `dashboard` menu, or the Overview without the menu module. */
export interface DashboardNavItem {
  id: string
  label: string
  description?: string
  icon?: string
  to: string
  external?: boolean
}

/** The id of the hub's own entry, the first of the `dashboard` menu. */
export const DASHBOARD_OVERVIEW_ID = 'dashboard-overview'

/**
 * The hub navigation: the items of the `dashboard` menu (the areas other modules add, filtered by their `permission`),
 * or, without `@frigear-nu/menu`, only the Overview. `links` are ready for `AreaNavLayout`/`UNavigationMenu`
 * (localised, `active` set, the Overview only active on the hub page), `shortcuts` are the items other than the
 * Overview, and `current` is the item the route belongs to. Await it, so the menu is resolved before the page renders.
 */
export async function useDashboardNav() {
  const t = useModuleT('dashboard')
  const home = useRuntimeConfig().public.dashboard?.pages?.home
  const { isActive, strip } = useLocaleLink()

  // `@frigear-nu/menu` is optional: without it `useMenu` is `undefined` and the Overview is the only entry.
  const menu = typeof useMenu === 'function' ? useMenu('dashboard') : undefined

  const fallback = (): DashboardNavItem[] => home
    ? [{ id: DASHBOARD_OVERVIEW_ID, to: home, label: t('menu.overview.label', 'Overview'), description: t('menu.overview.description', 'Your shortcuts and overview.'), icon: 'i-lucide-layout-dashboard' }]
    : []

  const items = computed<DashboardNavItem[]>(() => menu
    ? (menu.data.value ?? [])
        .filter((item): item is MenuItem & { to: string } => !!item.to)
        .map(item => ({ id: item.id ?? item.to, label: item.label, description: item.description, icon: item.icon, to: item.to, external: item.external }))
    : fallback())

  const shortcuts = computed(() => items.value.filter(item => item.id !== DASHBOARD_OVERVIEW_ID))

  // The Overview sits at the area's base path, so it is only active there.
  const links = useNavLinks(items, { exact: home ? [home] : [] })

  // The most specific item containing the route: `/dashboard/crew/shifts` belongs to Crew.
  const current = computed<DashboardNavItem | undefined>(() => items.value
    .filter(item => !item.external && isActive(item.to, { exact: item.to === home }))
    .sort((a, b) => strip(b.to).length - strip(a.to).length)[0])

  if (menu) await menu

  return { items, shortcuts, links, current }
}
