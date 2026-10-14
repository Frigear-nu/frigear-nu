export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/admin', '~/modules/demo'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: 'latest',
  admin: { settings: { roles: false } },
})
