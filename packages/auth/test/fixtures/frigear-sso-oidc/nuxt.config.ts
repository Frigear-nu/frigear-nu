import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  runtimeConfig: {
    previewDeployment: false,
    // What NUXT_OAUTH_OIDC_* sets in production; there is no `frigear.sso` config.
    oauth: { oidc: { clientId: 'client', clientSecret: 'secret', openidConfig: 'https://frigear.nu/.well-known/openid-configuration' } },
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
      password: false,
      oauth: { frigear: true },
    },
  },
})
