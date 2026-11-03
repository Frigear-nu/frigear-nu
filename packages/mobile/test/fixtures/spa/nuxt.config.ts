import MobileModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MobileModule],
  // Installs @frigear-nu/auth (client mode) with the mobile defaults (native.scheme: appId). Nothing is guarded.
  authentication: {
    mode: 'client',
    client: {
      issuer: 'https://id.example.test',
      clientId: 'spa-fixture',
      // The fixture has no Keychain plugin; a real app installs @aparajita/capacitor-secure-storage.
      storage: 'local',
    },
  },
  mobile: {
    appId: 'nu.frigear.Spa',
    appName: 'SPA fixture',
    tabs: [{ id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house' }],
  },
})
