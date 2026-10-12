export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '../src/module',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
})
