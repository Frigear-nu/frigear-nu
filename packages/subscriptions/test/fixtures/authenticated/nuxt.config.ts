import SubscriptionsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    SubscriptionsModule,
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
  subscriptions: {
    plans: {
      member: { label: 'Member', description: 'Basic membership', rank: 1, prices: [{ lookupKey: 'member_monthly' }, { lookupKey: 'member_yearly' }] },
      patron: { label: 'Patron', rank: 2, prices: ['price_patron_y'] },
      secret: { rank: 3, prices: ['price_secret_m'] },
    },
    settings: {
      pages: { membership: '/account/membership', success: true, cancel: true },
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true, admin: { page: false } },
  },
})
