// Reading and merging the stored `dashboardLayouts` preference. Framework free (zod only), so the server routes and
// the unit tests share it.
import { DASHBOARD_LIMITS, dashboardLayoutSchema, dashboardNameSchema } from '../preferences'
import type { DashboardLayout } from '../../types'

export type DashboardLayouts = Record<string, DashboardLayout>

/**
 * The valid layouts of a stored value, by dashboard name. A layout that no longer parses (a limit changed, a row edited
 * by hand) is dropped on its own, so it never fails the others or every later save. At most `DASHBOARD_LIMITS.dashboards`.
 */
export function validDashboardLayouts(stored: unknown): DashboardLayouts {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
  const layouts: DashboardLayouts = {}
  for (const [name, value] of Object.entries(stored)) {
    if (Object.keys(layouts).length >= DASHBOARD_LIMITS.dashboards) break
    if (!dashboardNameSchema.safeParse(name).success) continue
    const parsed = dashboardLayoutSchema.safeParse(value)
    if (parsed.success) layouts[name] = parsed.data as DashboardLayout
  }
  return layouts
}

/**
 * The layouts after a change: each named dashboard replaced, or removed with `null`; the others kept. `null` when the
 * result would hold more than `DASHBOARD_LIMITS.dashboards` layouts.
 */
export function mergeDashboardLayouts(current: DashboardLayouts, change: Record<string, DashboardLayout | null>): DashboardLayouts | null {
  const next: DashboardLayouts = Object.fromEntries(Object.entries({ ...current, ...change })
    .filter((entry): entry is [string, DashboardLayout] => entry[1] !== null))
  return Object.keys(next).length > DASHBOARD_LIMITS.dashboards ? null : next
}
