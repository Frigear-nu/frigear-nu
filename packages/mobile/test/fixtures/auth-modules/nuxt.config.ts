// Loaded with `overrides.modules` in every order by `auth-modules.test.ts`; this is only the base.
export default defineNuxtConfig({
  routeRules: {
    '/**': { authenticated: true } as never,
  },
  authentication: {
    mode: 'client',
    client: { issuer: 'https://id.example.test', clientId: 'order-fixture', storage: 'local' },
  },
  mobile: {
    appId: 'nu.frigear.Order',
    tabs: [
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house' },
      { id: 'account', to: '/account', label: 'Account', icon: 'i-lucide-user', requiresAuth: true },
    ],
  },
})
