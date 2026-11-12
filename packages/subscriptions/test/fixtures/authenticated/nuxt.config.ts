import { addPermission, addRole } from '@frigear-nu/auth/utils'
import SubscriptionsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    SubscriptionsModule,
    // `member` is held by everyone with an active subscription on any plan (the `subscription` requirement); `insider`
    // by everyone on the `secret` plan, and it grants `test:insider`, which staff only hold with the `x-insider` header
    // (`server/plugins/policy.ts`): granting that plan needs it.
    (_options, nuxt) => {
      addPermission(nuxt, { name: 'test:insider', label: 'Insider' })
      addRole(nuxt,
        { name: 'member', label: 'Member', grant: ['subscriptions:read'], requirements: { subscription: '*' }, auto: true, source: 'host' },
        { name: 'insider', label: 'Insider', grant: ['test:insider'], requirements: { subscription: 'secret' }, auto: true, source: 'host' },
      )
    },
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
      mcp: true,
      pages: { membership: '/account/membership', success: true, cancel: true },
    },
  },
  users: {
    settings: { admin: { page: false } },
  },
})
