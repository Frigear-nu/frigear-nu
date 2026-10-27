import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    // Renders the `/auth/verify-email-change` and `/auth/revert-email-change` pages.
    '@nuxt/ui',
    MyModule,
  ],
  pages: true,
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
  },
  notify: {
    email: { driver: './server/utils/mail-driver' },
  },
  users: {
    settings: { verifyEmailChange: true },
  },
})
