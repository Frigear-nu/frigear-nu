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
    stripe: {
      secretKey: 'sk_test_fake',
      webhookSecret: 'whsec_test_secret',
    },
    public: {
      stripe: { publishableKey: 'pk_test_fake' },
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
    kv: true,
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
