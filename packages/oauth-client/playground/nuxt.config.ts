import OAuthClientModule from '../src/module'

// A browser SPA signing in against a frigear oauth-server (or any OIDC provider). Point it at one with
// NUXT_PUBLIC_OAUTH_CLIENT_ISSUER / NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_ID and register
// http://localhost:3000/auth/callback as a redirect URI of a public client.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', OAuthClientModule],
  ssr: false,
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  oauthClient: {
    issuer: 'http://localhost:3001',
    clientId: 'playground',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    protect: 'all',
  },
})
