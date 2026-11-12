import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    MyModule,
  ],
  runtimeConfig: {
    appSecret: 'a-test-only-app-secret-at-least-32-characters',
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  authentication: {
    settings: {
      pages: { login: true, register: true },
      // The emailed link opens the `/auth/magic-link` confirm page.
      magicLink: true,
    },
  },
})
