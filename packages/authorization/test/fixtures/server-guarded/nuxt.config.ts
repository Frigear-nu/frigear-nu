import MyModule from '../../../src/module'

// A server-mode app signed in everywhere, with the API for admins only: Auth's anonymous entry points stay open.
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', MyModule],
  runtimeConfig: {
    session: { password: 'a-test-only-session-password-at-least-32-chars' },
  },
  routeRules: {
    '/**': { authenticated: true },
    '/api/**': { roles: ['admin'] },
  },
  hub: {
    db: { dialect: 'sqlite', driver: 'libsql', applyMigrationsDuringBuild: false },
  },
  authentication: {
    settings: { magicLink: true },
  },
})
