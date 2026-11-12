import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import PaymentsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/stripe',
    PaymentsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'staff', label: 'Staff', grant: ['payments:manage', 'users:read'] })
      // May see users but not their payments (the user payments route needs `payments:manage`).
      addRole(nuxt, { name: 'reader', label: 'Reader', grant: ['users:read'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
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
  // The users admin API (and its `users:read` permission) the payments routes below a user build on.
  users: {
    settings: { admin: { page: false } },
  },
})
