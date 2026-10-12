import FormsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    FormsModule,
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
      pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true },
      rateLimit: 0,
    },
    // Only recaptcha has an environment secret, so tests can tell it apart from a per-form one.
    captcha: { recaptcha: { secretKey: 'env-recaptcha-secret' } },
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
