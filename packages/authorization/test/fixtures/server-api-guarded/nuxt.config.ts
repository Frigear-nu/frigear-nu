import MyModule from '../../../src/module'

// A server-mode app whose whole API needs `roles:read`: Auth's endpoints stay open.
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', MyModule],
  runtimeConfig: {
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
  },
  routeRules: {
    '/api/**': { permission: 'roles:read' },
  },
  hub: {
    db: { dialect: 'sqlite', driver: 'libsql', applyMigrationsDuringBuild: false },
  },
  authentication: {
    settings: { magicLink: true },
  },
})
