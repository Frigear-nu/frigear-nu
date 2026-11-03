import AuthorizationModule from '../../../src/module'

// A client-mode app (a static SPA or a Capacitor app) signed in everywhere, as the mobile starter is.
export default defineNuxtConfig({
  modules: [AuthorizationModule],
  routeRules: {
    '/**': { authenticated: true },
    '/admin/**': { roles: ['admin'] },
  },
  authentication: {
    mode: 'client',
    client: { issuer: 'https://id.example.test', clientId: 'fixture-app', storage: 'local' },
  },
  authorization: { redirectTo: '/login' },
})
