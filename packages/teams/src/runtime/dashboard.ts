import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { teamsAccess } from './access'

/** The dashboard teams adds its items to when `@frigear-nu/dashboard` is installed. */
export const TEAMS_DASHBOARD = 'crew.home'

/**
 * The items teams adds to `crew.home`. `resolve` turns a path relative to `module.ts` into an absolute one. Kept apart
 * from the module so a test can register them without a Nuxt build.
 */
export function teamsDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'teams.mine',
      component: resolve('./runtime/app/dashboard/MyTeams.vue'),
      title: 'My teams',
      titleKey: 'teams.dashboard.mine',
      order: 60,
      permission: teamsAccess.permissions.read,
    },
  ]
}
