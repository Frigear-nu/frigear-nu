import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/admin',
    '@frigear-nu/widget',
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
  // The admin area is unguarded here (no authorization module); the users admin API still runs the policy plugin.
  admin: { settings: { roles: false } },
  authentication: {
    settings: { magicLink: true },
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
  users: {
    settings: { admin: true },
  },
})
