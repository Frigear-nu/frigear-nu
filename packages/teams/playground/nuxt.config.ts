export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxthub/core', '@frigear-nu/users', '@frigear-nu/admin', '@frigear-nu/teams'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  teams: {
    settings: { pages: { admin: true, adminTeam: true } },
  },
})
