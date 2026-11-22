import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import MyModule from '../../../src/module'

// `@nuxtjs/i18n` is not a dependency of this package: borrow the workspace's copy (the base layer's) rather than add
// one, so the guard is checked under a locale prefix (`/da/account/...`) too.
const i18n = join(dirname(createRequire(new URL('../../../../base-layer/package.json', import.meta.url)).resolve('@nuxtjs/i18n/package.json')), 'dist/module.mjs')

export default defineNuxtConfig({
  modules: [
    i18n,
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
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
      pages: { index: true, profile: true, security: true, documents: true, apiTokens: true },
      documents: [{ id: 'handbook', label: { en: 'Volunteer Handbook' }, path: '/assets/handbook.docx' }],
    },
  },
  authorization: { redirectTo: '/sign-in' },
  i18n: {
    defaultLocale: 'en',
    strategy: 'prefix_except_default',
    locales: [{ code: 'en', language: 'en-GB' }, { code: 'da', language: 'da-DK' }],
  },
})
