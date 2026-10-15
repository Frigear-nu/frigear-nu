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
      pages: { index: true, profile: true, security: true },
    },
  },
})
