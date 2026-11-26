export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/short-links',
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
