import MyModule from '../../../src/module'

// A server-mode app whose whole API is for admins: Auth's endpoints stay open.
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', MyModule],
  runtimeConfig: {
    session: { password: 'a-test-only-session-password-at-least-32-chars' },
  },
  routeRules: {
    '/api/**': { roles: ['admin'] },
  },
  hub: {
    db: { dialect: 'sqlite', driver: 'libsql', applyMigrationsDuringBuild: false },
  },
  authentication: {
    settings: { magicLink: true },
  },
})
