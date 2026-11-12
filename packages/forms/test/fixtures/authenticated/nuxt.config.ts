import { fileURLToPath } from 'node:url'
import { addRole, setRoleProvider } from '@frigear-nu/auth/utils'
import FormsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/admin',
    FormsModule,
    // Roles without `@frigear-nu/authorization`: a provider reading the test user's email (see `server/roles/provider.ts`).
    (_options, nuxt) => {
      addRole(nuxt, { name: 'formsmanager', label: 'Forms manager', grant: ['forms:manage', 'forms:credentials', 'forms:pii'] })
      addRole(nuxt, { name: 'wild', label: 'Wildcard staff', grant: ['forms:*'] })
      setRoleProvider(nuxt, { path: fileURLToPath(new URL('./server/roles/provider', import.meta.url)) })
    },
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
    kv: true,
    blob: true,
  },
  forms: {
    settings: {
      mcp: true,
      pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true },
      rateLimit: 0,
    },
    // Only recaptcha has an environment secret, so tests can tell it apart from a per-form one.
    captcha: { recaptcha: { secretKey: 'env-recaptcha-secret' } },
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
})
