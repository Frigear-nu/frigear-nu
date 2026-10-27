import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  // What `NUXT_OAUTH_<PROVIDER>_*` env vars set at runtime.
  runtimeConfig: {
    oauth: {
      auth0: { clientId: 'auth0-id', clientSecret: 'auth0-secret', domain: 'example.auth0.com' },
      okta: { clientId: 'okta-id', clientSecret: 'okta-secret', domain: 'example.okta.com' },
      github: { clientId: 'github-id', clientSecret: 'github-secret' },
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
    settings: {
      oauth: {
        auth0: { label: 'Company SSO', icon: 'i-simple-icons-auth0', signUp: false },
        github: false,
      },
    },
  },
})
