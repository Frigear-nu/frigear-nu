import MyModule from '../../../src/module'

// A server-mode app signed in everywhere: Auth's anonymous entry points stay open, an app rule below them still holds.
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', MyModule],
  runtimeConfig: {
    session: { password: 'a-test-only-session-password-at-least-32-chars' },
  },
  routeRules: {
    '/**': { authenticated: true },
    '/api/auth/me/tokens': { roles: ['admin'] },
  },
  hub: {
    db: { dialect: 'sqlite', driver: 'libsql', applyMigrationsDuringBuild: false },
  },
  authentication: {
    settings: { magicLink: true },
  },
})
