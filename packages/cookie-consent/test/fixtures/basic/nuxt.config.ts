import MyModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [MyModule],
  cookieConsent: {
    version: 'test',
    // The app's customizations, tested by the 'customized by the app' suite: a localized policy link and its own components in `components/`.
    policyUrl: { en: '/legal/cookies', da: '/da/juridisk/cookies' },
    policyLabel: { en: 'Read our cookie policy', da: 'Læs vores cookiepolitik' },
  },
})
