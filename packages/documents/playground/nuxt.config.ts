export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxthub/core', '@frigear-nu/users', '@frigear-nu/admin', '@frigear-nu/groups', '@frigear-nu/documents'],
  compatibilityDate: 'latest',
  hub: { db: { dialect: 'sqlite', driver: 'libsql' }, blob: true },
  documents: { settings: { pages: { documents: true, admin: true } } },
  groups: { settings: { pages: { admin: true, adminGroup: true } } },
  users: { mode: 'server', settings: { migrations: true, password: true } },
})
