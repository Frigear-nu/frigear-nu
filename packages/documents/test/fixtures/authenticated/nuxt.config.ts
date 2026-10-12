import GroupsModule from '../../../../groups/src/module'
import DocumentsModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/admin',
    '@frigear-nu/menu',
    '@frigear-nu/account',
    GroupsModule,
    DocumentsModule,
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
    blob: true,
  },
  account: {
    settings: { pages: { index: true } },
  },
  documents: {
    settings: {
      pages: { documents: true, admin: true },
      maxFileSize: 1000,
      accept: ['application/pdf', 'text/plain'],
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true, password: true },
  },
})
