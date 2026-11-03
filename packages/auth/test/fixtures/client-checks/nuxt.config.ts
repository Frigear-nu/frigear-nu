import AuthModule from '../../../src/module'

// Loaded with `overrides` by `client-checks.test.ts`; this is only the base.
export default defineNuxtConfig({
  modules: [AuthModule],
  authentication: {
    mode: 'client',
    client: { issuer: 'https://id.example.test', clientId: 'fixture-app', storage: 'local' },
  },
})
