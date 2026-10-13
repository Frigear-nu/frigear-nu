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
    userStore: './server/utils/user-store',
    settings: { password: false },
    scopes: [
      { name: 'events:read', description: 'Read events' },
      { name: 'events:write', description: 'Change events' },
      { name: 'events:admin', description: 'Administer events', roles: ['admin'] },
    ],
  },
})
