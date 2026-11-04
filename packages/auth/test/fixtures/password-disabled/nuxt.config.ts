import MyModule from '../../../src/module'

// Every server feature that can be turned off, off at once: password sign-in, user API tokens, and frigear.nu SSO
// (listed, but neither a preview deployment nor configured). Shared by `password-disabled.test.ts`' suites.
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    MyModule,
  ],
  runtimeConfig: {
    previewDeployment: false,
  },
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',
      applyMigrationsDuringBuild: false,
    },
  },
  authentication: {
    apiTokens: false,
    settings: {
      password: false,
      oauth: { frigear: true },
    },
  },
})
