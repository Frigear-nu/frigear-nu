import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MyModule],
  cookieConsent: {
    version: 'test',
    policyUrl: { en: '/legal/cookies', da: '/da/juridisk/cookies' },
    policyLabel: { en: 'Read our cookie policy', da: 'Læs vores cookiepolitik' },
  },
})
