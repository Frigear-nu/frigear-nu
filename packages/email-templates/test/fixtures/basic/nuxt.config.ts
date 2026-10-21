import EmailTemplates from '../../../src/module'

export default defineNuxtConfig({
  modules: [EmailTemplates, './modules/fixture'],
  compatibilityDate: 'latest',
  notify: { email: { driver: './server/utils/mail-driver' } },
})
