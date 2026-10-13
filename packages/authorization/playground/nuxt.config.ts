export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
  ],
  devtools: { enabled: true },
  routeRules: {
    '/admin/**': { roles: ['admin'] },
  },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  authorization: {
    redirectTo: '/login',
  },
})
