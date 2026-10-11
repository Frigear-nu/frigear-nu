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
  account: {
    settings: { verifyEmailChange: true },
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
