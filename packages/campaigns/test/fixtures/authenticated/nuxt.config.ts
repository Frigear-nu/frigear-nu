import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import CampaignsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    '@frigear-nu/admin',
    '@frigear-nu/notify',
    // The confirmation email renders from its template (`campaigns-confirm`), the way it does in an app with templates.
    '@frigear-nu/email-templates',
    CampaignsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    // `admin` holds what the module `grantTo`s it (`campaigns:pii` included); `manager` holds `campaigns:manage` only and
    // `wild` holds `campaigns:*`, which never covers `campaigns:pii`.
    (_options, nuxt) => {
      addRole(nuxt, { name: 'admin', label: 'Admin', grant: [] })
      addRole(nuxt, { name: 'manager', label: 'Manager', grant: ['campaigns:manage'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['campaigns:*'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
  ],
  pages: true,
  runtimeConfig: {
    // Seals the sessions, and unsubscribe links and IP hashes are signed with a key derived from it.
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
    kv: true,
  },
  campaigns: {
    // The suite signs up many times from one address; the rate limit has its own test with a low limit set at run time.
    rateLimit: 1000,
    corsOrigins: ['https://partner.test'],
  },
  notify: {
    // Emails (as delivered, after the template rendered them) and texts are captured in memory.
    email: { driver: './server/utils/mail-driver' },
    sms: { driver: './server/utils/sms-driver' },
  },
})
