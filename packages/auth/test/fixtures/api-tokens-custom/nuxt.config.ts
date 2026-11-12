import MyModule from '../../../src/module'

// User API tokens with a host prefix. A fixture of its own rather than a layer over `auth-db`: NuxtHub generates its
// database client into the layer's node_modules, which the two suites would then share while running in parallel.
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
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
  authentication: {
    userStore: './server/utils/user-store',
    settings: { password: false },
    apiTokens: { prefix: 'acme_' },
    // The deprecated scope option: `aggregateTo: ['user']` makes it an implicit permission.
    scopes: [{ name: 'events:read', description: 'Read events', aggregateTo: ['user'] }],
  },
})
