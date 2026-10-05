export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/navigation',
    '@frigear-nu/account',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  account: {
    settings: {
      pages: { index: true, profile: true, security: true },
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
