import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import MyModule from '../../../src/module'

// `@nuxtjs/i18n` is not a dependency of this package: borrow the workspace's copy (the base layer's) rather than add
// one. It is installed the way every host installs it, before the users module.
const i18n = join(dirname(createRequire(new URL('../../../../base-layer/package.json', import.meta.url)).resolve('@nuxtjs/i18n/package.json')), 'dist/module.mjs')

// The users module next to `@nuxtjs/i18n`, for the order of the client plugins (`remember-locale.test.ts`).
export default defineNuxtConfig({
  modules: [i18n, '@nuxthub/core', MyModule],
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: [{ code: 'en', language: 'en-GB' }, { code: 'da', language: 'da-DK' }],
  },
})
