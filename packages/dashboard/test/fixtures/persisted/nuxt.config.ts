import DashboardModule from '../../../src/module'

// Dashboard with Preferences (and so Auth and Users) on a sqlite database: layouts are the `managed` `dashboardLayouts`
// preference, read and written through `/api/dashboard/me/layouts`. The migrations are those of Users, Auth and
// Preferences: Dashboard adds no columns.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxthub/core', '@frigear-nu/users', '@frigear-nu/preferences', DashboardModule],
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
  dashboard: { homeTab: false },
})
