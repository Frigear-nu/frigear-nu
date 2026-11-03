import AuthModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [AuthModule],
  ssr: true,
  authentication: {
    mode: 'client',
    client: { issuer: 'https://id.example.test', clientId: 'fixture-app', storage: 'local' },
  },
})
