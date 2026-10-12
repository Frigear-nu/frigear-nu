export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxthub/core', '@frigear-nu/users', '@frigear-nu/admin', '@frigear-nu/groups'],
  compatibilityDate: 'latest',
  hub: { db: { dialect: 'sqlite', driver: 'libsql' } },
  groups: { settings: { pages: { admin: true, adminGroup: true } } },
  users: { mode: 'server', settings: { migrations: true, password: true } },
})
