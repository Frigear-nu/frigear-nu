export default defineNuxtConfig({
  modules: ['@nuxt/ui', '../src/module'],
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  compatibilityDate: 'latest',
  mobile: {
    appId: 'nu.frigear.playground',
    appName: 'Playground',
    // Up a little longer than needed, to see it.
    splashScreen: { minDuration: 1200 },
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house', sfSymbol: 'house' },
      { id: 'settings', to: '/settings', label: 'Settings', icon: 'i-lucide-settings', sfSymbol: 'gearshape' },
    ],
  },
})
