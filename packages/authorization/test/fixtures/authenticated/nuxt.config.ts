import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    MyModule,
  ],
  runtimeConfig: {
    session: {
      password: 'a-test-only-session-password-at-least-32-chars',
    },
  },
  routeRules: {
    '/admin/**': { authorization: { roles: ['admin'] } },
    '/api/admin/**': { authorization: { roles: ['admin'] } },
    // A more specific pattern wins over `/admin/**`, so this page is open again.
    '/admin/public': { authorization: false },
    '/ability-rule': { authorization: { ability: 'isAdmin' } },
    '/api/members': { authorization: true },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
})
