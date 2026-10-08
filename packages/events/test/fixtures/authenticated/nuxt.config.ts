import EventsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    '@frigear-nu/payments',
    '@frigear-nu/subscriptions',
    EventsModule,
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
  events: {
    settings: { pages: {} },
  },
  subscriptions: {
    plans: {
      member: { label: 'Member', rank: 1, prices: ['price_member_m'] },
      patron: { label: 'Patron', rank: 2, prices: ['price_patron_y'] },
    },
    settings: { pages: {} },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
