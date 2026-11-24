import { extendMenu } from '@frigear-nu/menu/utils'
import DashboardModule from '../../../src/module'

// Dashboard with Preferences (and so Auth and Users) on a sqlite database: layouts are the `managed` `dashboardLayouts`
// preference, read and written through `/api/dashboard/me/layouts`. Authorization and Menu: the hub at `/dashboard`
// (guarded, with the `dashboard` menu). The migrations are those of Users, Auth, Authorization and Preferences:
// Dashboard adds no columns.
export default defineNuxtConfig({
  modules: [
    '@nuxt/ui', '@nuxthub/core', '@frigear-nu/users', '@frigear-nu/authorization', '@frigear-nu/menu', '@frigear-nu/preferences', DashboardModule,
    // A stand-in area in the hub's `dashboard` menu: a shortcut on the hub page and an entry of its navigation.
    (_options, nuxt) => extendMenu(nuxt, 'dashboard', { id: 'crew', label: 'Crew', description: 'Your shifts and teams.', icon: 'i-lucide-hand-heart', to: '/dashboard/crew', order: 10 }),
  ],
  runtimeConfig: {
    session: {
      password: 'a-test-only-session-password-at-least-32-chars',
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  authorization: { redirectTo: '/sign-in' },
  dashboard: { homeTab: false },
})
