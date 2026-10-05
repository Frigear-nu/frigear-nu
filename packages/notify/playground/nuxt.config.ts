export default defineNuxtConfig({
  modules: ['@nuxt/ui', '../src/module'],
  notify: {
    ui: {
      driver: '@nuxt/ui',
    },
  },
})
