export default defineNuxtConfig({
  modules: ['@nuxt/ui', '../src/module'],
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  compatibilityDate: 'latest',
  mobile: {
    appId: 'nu.frigear.playground',
    appName: 'Playground',
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house', sfSymbol: 'house' },
      { id: 'settings', to: '/settings', label: 'Settings', icon: 'i-lucide-settings', sfSymbol: 'gearshape' },
    ],
  },
})
