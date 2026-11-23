import type { Nuxt } from '@nuxt/schema'
import { oauthAccess } from './access'

/**
 * An item of `@frigear-nu/dashboard` (its `DashboardItem`), as far as this module uses it. Typed here rather than
 * imported: dashboard is no package dependency of this one (see `importDashboardUtils` in `module.ts`).
 */
export interface OAuthDashboardItem {
  id: string
  component: string
  title?: string
  titleKey?: string
  order?: number
  span?: 1 | 2 | 3 | 4
  platforms?: Array<'web' | 'mobile'>
  permission?: string
}

/** What `module.ts` uses of `@frigear-nu/dashboard/utils`. */
export interface OAuthDashboardUtils {
  extendDashboard: (nuxt: Nuxt, name: string, items: OAuthDashboardItem[]) => void
  resolveHubDashboardName: (nuxt: Nuxt) => string
}

/**
 * The items the OAuth server adds to a dashboard (the signed-in hub's by default): "Your apps", the applications the
 * user may sign in to, first and across the whole grid. `resolve` turns a path relative to `module.ts` into an absolute
 * one. Kept apart from the module so a test can check them without a Nuxt build.
 */
export function oauthDashboardItems(resolve: (path: string) => string): OAuthDashboardItem[] {
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
