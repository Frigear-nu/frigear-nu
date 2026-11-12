import MyModule from '../../../src/module'

// Kept OAuth tokens (`keepTokens`): the oidc provider keeps them, and its discovery and token endpoints are test routes
// of this app (`NUXT_OAUTH_OIDC_OPENID_CONFIG`, set by the test once it knows the port). The tokens are encrypted
// with the fallback key from `NUXT_SESSION_PASSWORD`, which the test sets, as a deployment would.
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  runtimeConfig: {
    oauth: {
      oidc: { clientId: 'kept-client', clientSecret: 'kept-secret', openidConfig: '' },
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  authentication: {
    userStore: './server/utils/user-store',
    settings: { password: false, oauth: { oidc: { keepTokens: true } } },
  },
})
