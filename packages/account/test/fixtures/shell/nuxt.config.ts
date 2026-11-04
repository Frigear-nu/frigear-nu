import MyModule from '../../../src/module'
import ExtraModule from './extra/account-extra'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/menu',
    MyModule,
    ExtraModule,
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
      // Every shipped page, so the 'opt-in' suite of `shell.test.ts` shares this fixture.
      pages: { index: true, profile: true, security: true, documents: true, apiTokens: true },
      documents: [{ id: 'handbook', label: { en: 'Volunteer Handbook' }, path: '/assets/handbook.docx' }],
    },
  },
})
