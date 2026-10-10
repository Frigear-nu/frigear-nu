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
    '/admin/**': { roles: ['admin'] },
    '/api/admin/**': { roles: ['admin'] },
    // A more specific pattern overrides `/admin/**`, so this page is open again.
    '/admin/public': { authenticated: false },
    '/ability-rule': { ability: 'isAdmin' },
    '/api/members': { authenticated: true },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
