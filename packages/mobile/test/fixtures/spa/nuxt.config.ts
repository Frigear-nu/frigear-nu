import MobileModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MobileModule],
  mobile: {
    appId: 'nu.frigear.Spa',
    appName: 'SPA fixture',
    tabs: [{ id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house' }],
  },
  // Installs @frigear-nu/oauth-client with the mobile defaults (protect: 'all', native.scheme: appId).
  oauthClient: {
    issuer: 'https://id.example.test',
    clientId: 'spa-fixture',
    // The fixture has no Keychain plugin; a real app installs @aparajita/capacitor-secure-storage.
    storage: 'local',
  },
})
