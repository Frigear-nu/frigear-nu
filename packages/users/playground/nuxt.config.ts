export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
