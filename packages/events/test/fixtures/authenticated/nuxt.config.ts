import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import EventsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/admin',
    '@frigear-nu/stripe',
    '@frigear-nu/payments',
    '@frigear-nu/subscriptions',
    EventsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['events:*'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
  ],
  pages: true,
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
    settings: { pages: { events: true, event: true, tickets: true, admin: true, adminEvent: true }, mcp: true, roles: true },
  },
  subscriptions: {
    plans: {
      member: { label: 'Member', rank: 1, prices: ['price_member_m'] },
      patron: { label: 'Patron', rank: 2, prices: ['price_patron_y'] },
    },
    settings: { pages: {} },
  },
})
