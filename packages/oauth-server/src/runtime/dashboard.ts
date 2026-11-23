import type { DashboardItem } from '@frigear-nu/dashboard/types'
import { oauthAccess } from './access'

/**
 * The items the OAuth server adds to a dashboard (the signed-in hub's by default): "Your apps", the applications the
 * user may sign in to, first and across the whole grid. `resolve` turns a path relative to `module.ts` into an absolute
 * one. Kept apart from the module so a test can check them without a Nuxt build.
 */
export function oauthDashboardItems(resolve: (path: string) => string): DashboardItem[] {
  return [
    {
      id: 'oauth-server.apps',
      component: resolve('./runtime/app/dashboard/OAuthAppsWidget.vue'),
      title: 'Your apps',
      titleKey: 'oauthServer.dashboard.apps',
      order: 5,
      span: 4,
      platforms: ['web'],
      // Implicit: every signed-in user sees their own applications.
      permission: oauthAccess.permissions.read,
    },
  ]
}
