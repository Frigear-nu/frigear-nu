export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
  ],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  authorization: {
    routes: {
      '/admin/**': { roles: ['admin'] },
    },
    redirectTo: '/login',
  },
  users: {
    mode: 'server',
    settings: { migrations: true },
  },
})
