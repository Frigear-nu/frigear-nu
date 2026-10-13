export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu',
    '@frigear-nu/users',
    '@frigear-nu/account',
  ],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
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
})
