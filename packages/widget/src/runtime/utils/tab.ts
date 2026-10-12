import { basename, extname } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import type { RegisteredTab, TabDefinition } from '../../types'

export type { TabDefinition, RegisteredTab } from '../../types'

/** Id for a tab without one: its component's file name, e.g. `Payments` for `.../Payments.vue`. */
export function deriveTabId(tab: Pick<TabDefinition, 'id' | 'component'>): string {
  return tab.id ?? basename(tab.component, extname(tab.component))
}

/**
 * Build-time API for modules to contribute tabs to a named area, without the host wiring anything. Call it
 * once during a module's own `setup()`; registration order between modules doesn't matter. Tabs are kept apart
 * from widgets, so the same area name can hold both.
 *
 * ```ts
 * import { extendTabs } from '@frigear-nu/widget/utils'
 *
 * extendTabs(nuxt, 'admin.users', {
 *   component: resolver.resolve('./runtime/app/tabs/Payments.vue'),
 *   labelKey: 'admin.tabs.payments',
 *   label: 'Payments',
 *   order: 20,
 * })
 * ```
 *
 * A tab registered again under the same `id` in an area replaces the earlier one.
 */
export function extendTabs(nuxt: Nuxt, area: string, tabs: TabDefinition | TabDefinition[]): void {
  const normalized: RegisteredTab[] = (Array.isArray(tabs) ? tabs : [tabs])
    .map(tab => ({ ...tab, id: deriveTabId(tab), area }))

  nuxt.options.widgets ||= {}
  const registry: Record<string, RegisteredTab[]> = nuxt.options.widgets._tabs ||= {}
  const list = registry[area] ||= []

  for (const tab of normalized) {
    const existing = list.findIndex(item => item.id === tab.id)
    if (existing === -1) list.push(tab)
    else list[existing] = tab
  }

  nuxt.callHook('tabs:extend', area, normalized)
}
