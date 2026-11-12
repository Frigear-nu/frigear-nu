import MyModule from '../../../src/module'

// A server-mode app signed in everywhere: Auth's anonymous entry points stay open, an app rule below them still holds.
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', MyModule],
  runtimeConfig: {
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
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
