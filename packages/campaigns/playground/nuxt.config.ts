export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/admin',
    '@frigear-nu/campaigns',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
    kv: true,
  },
})
