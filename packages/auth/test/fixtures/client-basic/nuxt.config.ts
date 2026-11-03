import AuthModule from '../../../src/module'

export default defineNuxtConfig({
  modules: ['@nuxt/ui', AuthModule],
  authentication: {
    mode: 'client',
    client: {
      issuer: 'https://id.example.test',
      clientId: 'fixture-app',
      scopes: ['openid', 'profile', 'offline_access'],
      native: { scheme: 'nu.Frigear.Fixture' },
      apiBase: 'https://api.example.test',
    },
  },
})
