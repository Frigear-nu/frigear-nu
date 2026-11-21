// Build-time helpers for the dashboard registry. No `@nuxt/kit` import: the caller passes `hasModule`.
import type { DashboardRegistryEntry } from '../../types'

/** The widget area a dashboard's items are registered in. */
export const dashboardArea = (name: string): string => `dashboard.${name}`

/** The dashboard name of a widget area, or `undefined` for an area that is not a dashboard's. */
export function dashboardOfArea(area: string): string | undefined {
  return area.startsWith('dashboard.') ? area.slice('dashboard.'.length) : undefined
}

/** Whether an item's `when.module` holds. `when.platform` is decided at runtime. */
export function isModuleConditionMet(entry: Pick<DashboardRegistryEntry, 'when'>, hasModule: (name: string) => boolean): boolean {
  return !entry.when?.module || hasModule(entry.when.module)
}

/** The registry without the items whose `when.module` is not installed. */
export function resolveDashboardRegistry(
  dashboards: Record<string, DashboardRegistryEntry[]>,
  hasModule: (name: string) => boolean,
): Record<string, DashboardRegistryEntry[]> {
  return Object.fromEntries(Object.entries(dashboards)
    .map(([name, entries]) => [name, entries.filter(entry => isModuleConditionMet(entry, hasModule))]))
}

/** The `#dashboard/registry` module: plain data, keyed by dashboard name, then item id. */
export function dashboardRegistryTemplate(dashboards: Record<string, DashboardRegistryEntry[]>): string {
  const byId = Object.fromEntries(Object.entries(dashboards)
    .map(([name, entries]) => [name, Object.fromEntries(entries.map(entry => [entry.id, entry]))]))
  return `export const dashboards = ${JSON.stringify(byId)}\n`
}
