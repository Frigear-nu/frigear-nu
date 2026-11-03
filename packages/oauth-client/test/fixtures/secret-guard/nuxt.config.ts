import OAuthClientModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [OAuthClientModule],
  oauthClient: {
    issuer: 'https://id.example.test',
    clientId: 'fixture-app',
    storage: 'local',
  },
})
