export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
