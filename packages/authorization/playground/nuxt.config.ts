export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
  ],
  devtools: { enabled: true },
  routeRules: {
    '/admin/**': { permission: 'posts:update' },
  },
  compatibilityDate: 'latest',
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
    },
  },
  authentication: {
    permissions: [{ name: 'posts:update', label: 'Edit posts' }],
  },
  authorization: {
    redirectTo: '/login',
    roles: {
      admin: { label: 'Admin', grant: ['*'] },
      editor: { label: 'Editor', grant: ['posts:update'], inherit: ['user'] },
      user: { label: 'User' },
    },
  },
})
