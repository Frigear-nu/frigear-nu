import MobileModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MobileModule],
  mobile: {
    // SSR on, so the shell can be checked in the server-rendered HTML.
    spa: false,
    appId: 'nu.frigear.basic',
    appName: 'Basic fixture',
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house', sfSymbol: 'house' },
      { id: 'bills', to: '/bills', label: 'Bills', title: 'Your bills', icon: 'i-lucide-receipt-text', sfSymbol: 'list.bullet' },
    ],
  },
})
