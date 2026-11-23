export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    '@frigear-nu/operations',
    '@frigear-nu/teams',
    '@frigear-nu/forms',
    '@frigear-nu/notify',
    '@frigear-nu/crew',
    '@frigear-nu/shifts',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  operations: {
    settings: { pages: { admin: true, adminOperation: true } },
  },
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
  },
})
