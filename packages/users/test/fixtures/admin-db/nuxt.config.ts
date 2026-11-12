import { addPermission, addRole } from '@frigear-nu/auth/utils'
import MyModule from '../../../src/module'

// The users module with its admin area and MCP tools on, shared by every suite of `admin.test.ts`.
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/admin',
    '@frigear-nu/widget',
    MyModule,
    // A second permission, for a token that lacks `users:read`. The roles (no `@frigear-nu/authorization` here): the
    // `server/plugins/roles.ts` plugin hands them out by email through `authorization:roles`.
    (_options, nuxt) => {
      addPermission(nuxt, { name: 'test:read', description: 'Test permission' })
      addRole(nuxt,
        { name: 'admin', label: 'Admin', grant: ['*'], source: 'host' },
        { name: 'coordinator', label: 'Coordinator', grant: ['users:*'], source: 'host' },
      )
    },
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
  // The admin area is unguarded here (no authorization module); the users admin API still checks permissions.
  admin: { settings: { permission: false } },
  authentication: {
    settings: { magicLink: true },
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
  users: {
    settings: { admin: true, mcp: true },
  },
})
