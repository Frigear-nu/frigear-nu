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
    '@frigear-nu/crew',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  crew: {
    settings: { pages: { apply: true, status: true, invite: true } },
  },
  operations: {
    settings: { pages: { admin: true, adminOperation: true } },
  },
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
  },
})
