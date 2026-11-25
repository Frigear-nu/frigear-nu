import { fileURLToPath } from 'node:url'
import MyModule from '../../../src/module'

// Kept OAuth tokens (`keepTokens`): the oidc provider keeps them, and its discovery and token endpoints are test routes
// of this app (`NUXT_OAUTH_OIDC_OPENID_CONFIG`, set by the test once it knows the port). The tokens are encrypted
// with the legacy fallback key from `NUXT_SESSION_PASSWORD`, which the test sets, as an older deployment would.
// "Log in with frigear.nu" as a public client (a client id, no secret) with the browser handoff: a fake frigear.nu
// under `/api/test/issuer` (`NUXT_FRIGEAR_SSO_URL`, set by the test) issues signed id tokens for PKCE codes.
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  runtimeConfig: {
    oauth: {
      oidc: { clientId: 'kept-client', clientSecret: 'kept-secret', openidConfig: '' },
    },
    frigear: {
      sso: { clientId: 'desktop-client' },
      handoff: { returnUrl: 'frigear-test:/auth/return' },
    },
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  serverHandlers: [{
    route: '/api/test/issuer/.well-known/openid-configuration',
    handler: fileURLToPath(new URL('./server/issuer/discovery.ts', import.meta.url)),
  }],
  authentication: {
    userStore: './server/utils/user-store',
    settings: { password: false, oauth: { oidc: { keepTokens: true }, frigear: { handoff: true, keepTokens: true } } },
  },
})
