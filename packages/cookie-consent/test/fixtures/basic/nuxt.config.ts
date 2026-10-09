import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MyModule],
  cookieConsent: {
    version: 'test',
  },
})
