import MobileModule from '../../../src/module'
import TabsModule from './modules/tabs'

export default defineNuxtConfig({
  modules: [MobileModule, TabsModule],
  mobile: {
    spa: false,
    appId: 'nu.frigear.tabs',
    appName: 'Tabs fixture',
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house' },
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-user' },
    ],
  },
})
