export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/admin'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  admin: { settings: { roles: false } },
})
