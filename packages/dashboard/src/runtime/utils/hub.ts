import type { Nuxt } from '@nuxt/schema'
import type { ModuleOptions } from '../../types'
import { HUB_DEFAULTS } from '../shared/hub'

/**
 * The name of the dashboard the signed-in hub renders (`dashboard.settings.home.dashboard`, `home` by default), read
 * from the app's options so it works from a module set up before the dashboard. Modules add hub items with
 * `extendDashboard(nuxt, resolveHubDashboardName(nuxt), ...)`; whether there is a hub at all is
 * `resolveDashboardHubPath` of `@frigear-nu/module-kit/utils`.
 */
export function resolveHubDashboardName(nuxt: Nuxt): string {
  const options = (nuxt.options as { dashboard?: false | ModuleOptions }).dashboard
  return (options && options.settings?.home?.dashboard) || HUB_DEFAULTS.dashboard
}
