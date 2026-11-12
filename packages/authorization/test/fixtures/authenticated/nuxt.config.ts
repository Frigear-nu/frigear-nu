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
    // The roles admin API only requires a signed-in user here, so its own `roles:read` guard is what decides.
    '/api/admin/authorization/**': { roles: [], authenticated: true },
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
      list.push({ name: 'reports:read', aggregateTo: ['user'] } as { name: string }, { name: 'reports:write' })
    },
  },
  // The session user shows the editor role as a label: permissions still follow the stored role, for tokens too.
  authentication: {
    settings: { session: { mapper: './server/session-mapper.ts' } },
  },
  // Role-based access control: admin > editor > user. `reports:read` goes to every user, `reports:write` and
  // `roles:read` (the roles admin) to editors.
  authorization: {
    rbac: true,
    roles: {
      hierarchy: ['admin', 'editor', 'user'],
      grant: { editor: ['reports:write', 'roles:read'] },
      labels: { editor: 'Editor' },
    },
  },
})
