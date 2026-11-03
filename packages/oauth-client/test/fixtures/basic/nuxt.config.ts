import OAuthClientModule from '../../../src/module'

export default defineNuxtConfig({
  modules: ['@nuxt/ui', OAuthClientModule],
  // SSR on, so the pages can be checked in the server-rendered HTML.
  ssr: true,
  oauthClient: {
    issuer: 'https://id.example.test',
    clientId: 'fixture-app',
    scopes: ['openid', 'profile', 'offline_access'],
    native: { scheme: 'nu.Frigear.Fixture' },
    protect: 'all',
    publicPaths: ['/about'],
  },
})
