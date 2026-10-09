export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/cookie-consent'],
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  compatibilityDate: 'latest',
  cookieConsent: {
    policyUrl: '/privacy',
    persistToUser: false,
  },
})
