export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/notify'],
  css: ['~/assets/css/main.css'],
  notify: {
    ui: {
      driver: '@nuxt/ui',
    },
  },
})
