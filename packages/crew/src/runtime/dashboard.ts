import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { crewAccess } from './access'

/** The dashboard crew adds its items to when `@frigear-nu/dashboard` is installed. */
export const CREW_DASHBOARD = 'crew.home'

/**
 * The items crew adds to `crew.home`. `resolve` turns a path relative to `module.ts` into an absolute one. Kept apart
 * from the module so a test can register them without a Nuxt build.
 */
export function crewDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'crew.status',
      component: resolve('./runtime/app/dashboard/CrewStatus.vue'),
      title: 'My crew status',
      titleKey: 'crew.dashboard.status',
      order: 10,
      permission: crewAccess.permissions.read,
    },
  ]
}
