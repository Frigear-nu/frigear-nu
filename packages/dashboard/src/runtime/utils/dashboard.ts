import type { Nuxt } from '@nuxt/schema'
import { deriveWidgetId, extendWidgets } from '@frigear-nu/widget/utils'
import type { WidgetDefinition } from '@frigear-nu/widget/utils'
import type { DashboardItem, DashboardRegistryEntry } from '../../types'
import { dashboardArea } from '../shared/registry'

type DashboardOptionsInNuxt = { dashboard?: { _items?: Record<string, DashboardRegistryEntry[]> } | false }

/** What dashboard keeps of every registered item, by dashboard name (read once every module is done). */
export function getDashboardItems(nuxt: Nuxt): Record<string, DashboardRegistryEntry[]> {
  const options = (nuxt.options as unknown as DashboardOptionsInNuxt).dashboard
  return (options && options._items) || {}
}

/**
 * Adds items to a named dashboard (`crew.home`) from a module's `setup()`; the order between modules does not matter.
 * The component goes into the widget area `dashboard.<name>` (`extendWidgets`), the title and where the item shows into
 * `#dashboard/registry`. An item with an `id` that the dashboard has already replaces it.
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

  const options = nuxt.options as unknown as { dashboard?: { _items?: Record<string, DashboardRegistryEntry[]> } }
  options.dashboard ||= {}
  const registry = options.dashboard._items ||= {}
  const registered = registry[name] ||= []
  for (const entry of entries) {
    const existing = registered.findIndex(item => item.id === entry.id)
    if (existing === -1) registered.push(entry)
    else registered[existing] = entry
  }
}
