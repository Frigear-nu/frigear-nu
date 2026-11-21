import type { Nuxt } from '@nuxt/schema'
import { deriveWidgetId, extendWidgets } from '@frigear-nu/widget/utils'
import type { WidgetDefinition } from '@frigear-nu/widget/utils'
import type { DashboardItem, DashboardRegistryEntry } from '../../types'
import { dashboardArea } from '../shared/registry'

// Kept on a private key of its own, not under the `dashboard` options (a host may set `dashboard: false`).
type DashboardItemsInNuxt = { _dashboardItems?: Record<string, DashboardRegistryEntry[]> }

/** What dashboard keeps of every registered item, by dashboard name (read once every module is done). */
export function getDashboardItems(nuxt: Nuxt): Record<string, DashboardRegistryEntry[]> {
  return (nuxt.options as unknown as DashboardItemsInNuxt)._dashboardItems ?? {}
}

/**
 * Adds items to a named dashboard (`crew.home`) from a module's `setup()`; the order between modules does not matter.
 * The component goes into the widget area `dashboard.<name>` (`extendWidgets`), the title and where the item shows into
 * `#dashboard/registry`. An item with an `id` that the dashboard has already replaces it. Always use this rather than
 * `extendWidgets` on the area `dashboard.<name>`: a widget without the dashboard part is not shown.
 *
 * ```ts
 * import { extendDashboard } from '@frigear-nu/dashboard/utils'
 *
 * extendDashboard(nuxt, 'crew.home', {
 *   id: 'shifts.next',
 *   component: resolver.resolve('./runtime/app/dashboard/NextShift.vue'),
 *   titleKey: 'shifts.dashboard.next',
 *   order: 10,
 * })
 * ```
 */
export function extendDashboard(nuxt: Nuxt, name: string, items: DashboardItem | DashboardItem[]): void {
  const list = (Array.isArray(items) ? items : [items])
  if (!name) throw new Error('[@frigear-nu/dashboard] extendDashboard needs a dashboard name, such as `crew.home`.')

  const widgets: WidgetDefinition[] = []
  const entries: DashboardRegistryEntry[] = []
  for (const item of list) {
    const { title, titleKey, platforms, when, ...widget } = item
    const id = deriveWidgetId(widget)
    widgets.push({ ...widget, id })
    entries.push({
      id,
      ...(title !== undefined ? { title } : {}),
      ...(titleKey !== undefined ? { titleKey } : {}),
      ...(platforms !== undefined ? { platforms: [...platforms] } : {}),
      ...(when !== undefined ? { when: { ...when } } : {}),
    })
  }

  extendWidgets(nuxt, dashboardArea(name), widgets)

  const options = nuxt.options as unknown as DashboardItemsInNuxt
  const registry = options._dashboardItems ||= {}
  const registered = registry[name] ||= []
  for (const entry of entries) {
    const existing = registered.findIndex(item => item.id === entry.id)
    if (existing === -1) registered.push(entry)
    else registered[existing] = entry
  }
}
