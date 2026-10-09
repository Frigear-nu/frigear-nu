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
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
