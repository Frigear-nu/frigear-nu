import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
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
  authorization: {
    routes: {
      '/admin/**': { roles: ['admin'] },
      '/api/admin/**': { roles: ['admin'] },
      '/ability-rule': { ability: 'isAdmin' },
      '/api/members': {},
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
