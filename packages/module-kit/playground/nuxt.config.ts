export default defineNuxtConfig({
  modules: ['@nuxthub/core', '../src/module', './modules/pages'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      casing: 'snake_case',
      driver: 'libsql',
    },
  },
})
