import type { Nuxt } from '@nuxt/schema'
import { extendMenu } from '@frigear-nu/menu/utils'
import type { MenuItem } from '@frigear-nu/menu/utils'
import { extendWidgets } from '@frigear-nu/widget/utils'
import type { WidgetDefinition } from '@frigear-nu/widget/utils'

export const ADMIN_NAV_MENU = 'admin.nav'
export const ADMIN_DASHBOARD_AREA = 'admin.dashboard'

/** Adds entries to the admin sidebar (the `admin.nav` menu of `@frigear-nu/menu`). Call from a module's `setup()`. */
export const extendAdminNav = (nuxt: Nuxt, items: MenuItem | MenuItem[]) => extendMenu(nuxt, ADMIN_NAV_MENU, items)

/** Adds widgets to the admin dashboard (the `admin.dashboard` area of `@frigear-nu/widget`). Call from a module's `setup()`. */
export const extendAdminDashboard = (nuxt: Nuxt, widgets: WidgetDefinition | WidgetDefinition[]) =>
  extendWidgets(nuxt, ADMIN_DASHBOARD_AREA, widgets)
