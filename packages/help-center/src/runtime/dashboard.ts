import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { helpCenterAccess } from './access'

/** The dashboard help center adds its item to when `@frigear-nu/dashboard` is installed. */
export const HELP_CENTER_DASHBOARD = 'crew.home'

/**
 * The items help center adds to `crew.home`: the summary of the person's onboarding checklists, the same component as the
 * `account.overview` widget (which stays). `resolve` turns a path relative to `module.ts` into an absolute one. Kept apart
 * from the module so a test can register them without a Nuxt build.
 */
export function helpCenterDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'help-center.onboarding',
      component: resolve('./runtime/app/widgets/OnboardingSummary.vue'),
      title: 'Your onboarding',
      titleKey: 'helpCenter.dashboard.onboarding',
      order: 70,
      permission: helpCenterAccess.permissions.read,
    },
  ]
}
