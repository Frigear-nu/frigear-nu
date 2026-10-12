import MyModule from '../../../src/module'

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
    userLoader: './server/utils/user-loader',
    scopes: [
      { name: 'notes:read', description: 'Read notes' },
      { name: 'notes:manage', description: 'Manage notes' },
      { name: 'notes:pii', description: 'See who wrote notes' },
    ],
  },
})
