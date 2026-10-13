import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/mcp',
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
  users: {
    settings: { mcp: true },
  },
})
