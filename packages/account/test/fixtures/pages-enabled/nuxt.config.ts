import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    MyModule,
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
  },
  account: {
    settings: {
      pages: { index: true, profile: true, security: true, documents: true },
      documents: [{ id: 'handbook', label: { en: 'Volunteer Handbook' }, path: '/assets/handbook.docx' }],
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
