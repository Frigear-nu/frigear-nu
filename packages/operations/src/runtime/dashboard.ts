import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { operationsAccess } from './access'

/** The dashboard operations adds its items to when `@frigear-nu/dashboard` is installed. */
export const OPERATIONS_DASHBOARD = 'crew.home'

/**
 * The items operations adds to `crew.home`. `resolve` turns a path relative to `module.ts` into an absolute one. Kept
 * apart from the module so a test can register them without a Nuxt build.
 */
export function operationsDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'operations.upcoming',
      component: resolve('./runtime/app/dashboard/UpcomingOperations.vue'),
      title: 'Upcoming operations',
      titleKey: 'operations.dashboard.upcoming',
      order: 50,
      permission: operationsAccess.permissions.read,
    },
  ]
}
