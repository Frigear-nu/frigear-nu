import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { shiftsAccess } from './access'

/** The dashboard shifts adds its items to when `@frigear-nu/dashboard` is installed. */
export const SHIFTS_DASHBOARD = 'crew.home'

/**
 * The items shifts adds to `crew.home`. `resolve` turns a path relative to `module.ts` into an absolute one. Kept apart
 * from the module so a test can register them without a Nuxt build.
 */
export function shiftsDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'shifts.next',
      component: resolve('./runtime/app/dashboard/NextShift.vue'),
      title: 'My next shift',
      titleKey: 'shifts.dashboard.next',
      order: 20,
      permission: shiftsAccess.permissions.read,
    },
    {
      id: 'shifts.on-now',
      component: resolve('./runtime/app/dashboard/TeamOnNow.vue'),
      title: 'My team on shift now',
      titleKey: 'shifts.dashboard.onNow',
      order: 30,
      permission: shiftsAccess.permissions.read,
    },
    {
      id: 'shifts.swaps',
      component: resolve('./runtime/app/dashboard/OpenSwaps.vue'),
      title: 'Open swaps',
      titleKey: 'shifts.dashboard.swaps',
      order: 40,
      permission: shiftsAccess.permissions.read,
    },
  ]
}
