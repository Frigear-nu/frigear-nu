import type { Nuxt } from '@nuxt/schema'
import { extendMenu } from '@frigear-nu/menu/utils'
import type { MenuItem } from '@frigear-nu/menu/utils'
import { extendWidgets } from '@frigear-nu/widget/utils'
import type { WidgetDefinition } from '@frigear-nu/widget/utils'

/**
 * The path of an admin page below the configured admin base (`admin.settings.base`, `/admin` by default):
 * `adminRoute(nuxt, 'events', ':id')` is `/admin/events/:id`. Module defaults use it so they follow the host's base.
 */
export const adminRoute = (nuxt: Nuxt, ...segments: string[]) => {
  const base = (nuxt.options as { admin?: { settings?: { base?: string } } }).admin?.settings?.base ?? '/admin'
  return [base.replace(/\/+$/, ''), ...segments].join('/')
}

export const ADMIN_NAV_MENU = 'admin.nav'
export const ADMIN_DASHBOARD_AREA = 'admin.dashboard'
/** The stat row above the dashboard content. */
export const ADMIN_DASHBOARD_TOP_AREA = 'admin.dashboard.top'
/** The narrow column next to the main dashboard content. */
export const ADMIN_DASHBOARD_SIDE_AREA = 'admin.dashboard.side'

export type AdminDashboardPosition = 'top' | 'main' | 'side'

const DASHBOARD_AREAS: Record<AdminDashboardPosition, string> = {
  top: ADMIN_DASHBOARD_TOP_AREA,
  main: ADMIN_DASHBOARD_AREA,
  side: ADMIN_DASHBOARD_SIDE_AREA,
}

/** Adds entries to the admin sidebar (the `admin.nav` menu of `@frigear-nu/menu`). Call from a module's `setup()`. */
export const extendAdminNav = (nuxt: Nuxt, items: MenuItem | MenuItem[]) => extendMenu(nuxt, ADMIN_NAV_MENU, items)

/**
 * Adds widgets to the admin dashboard (an area of `@frigear-nu/widget`). Call from a module's `setup()`.
 * `position` picks the area: `top` is the stat row (use `AdminStatCard`), `main` the content column (the default),
 * `side` the narrow column.
 */
export const extendAdminDashboard = (nuxt: Nuxt, widgets: WidgetDefinition | WidgetDefinition[], position: AdminDashboardPosition = 'main') =>
  extendWidgets(nuxt, DASHBOARD_AREAS[position], widgets)
