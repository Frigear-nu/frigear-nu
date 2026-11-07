import MyModule from '../../../src/module'

// Password sign-in on (the default) next to magic links, email verification and OAuth providers. Shared by
// `password-enabled.test.ts`' suites.
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
    // Counters of the sign-in throttling; in memory so a rerun starts fresh.
    kv: { driver: 'memory' },
  },
  authentication: {
    settings: {
      magicLink: { signUp: true },
      // Low enough for `password-enabled.test.ts` to reach it.
      rateLimit: { login: 3 },
      verifyEmail: true,
      oauth: {
        auth0: { label: 'Company SSO', icon: 'i-simple-icons-auth0', signUp: false },
        github: false,
        // Listed, but without credentials.
        facebook: true,
      },
    },
  },
})
