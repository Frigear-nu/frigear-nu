import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    MyModule,
  ],
  runtimeConfig: {
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
  },
  // Auth's server middleware enforces these for `/api/**`, the page middleware for pages. The roles admin API has no
  // rule: its own `roles:read` / `roles:assign` checks decide.
  routeRules: {
    '/admin/**': { permission: 'admin:access' },
    // A more specific pattern overrides `/admin/**`, so this page is open again.
    '/admin/public': { authenticated: false },
    '/api/admin/stats': { permission: 'admin:access' },
    '/api/members': { authenticated: true },
    '/api/reports': { permission: 'reports:read' },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  // The fixture's permissions and the `verified` requirement come from `modules/access.ts`. Admins hold everything,
  // editors may see and assign roles (only those within their own permissions), members are `auto` (emails at
  // `member.test`).
  authorization: {
    defaultRoles: ['user'],
    roles: {
      admin: { label: 'Admin', grant: ['*'] },
      editor: { label: 'Editor', grant: ['reports:write', 'roles:read', 'roles:assign'], inherit: ['user'] },
      member: { label: 'Member', grant: ['member-area:view'], requirements: { verified: true }, auto: true },
      user: { label: 'User', grant: ['reports:read'] },
    },
  },
})
