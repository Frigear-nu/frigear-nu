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
    // A role rule is session-only by default; these two opt bearer credentials in.
    '/api/reports': { roles: ['admin'], scopes: ['reports:read'] },
    '/api/open-admin': { roles: ['admin'], sessionOnly: false },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  hooks: {
    'auth:scopes': (list: { name: string }[]) => {
      list.push({ name: 'reports:read' }, { name: 'reports:write' })
    },
  },
})
