import AuthModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [AuthModule],
  authentication: {
    mode: 'client',
    client: { issuer: 'https://id.example.test', clientId: 'fixture-app', storage: 'local' },
  },
})
