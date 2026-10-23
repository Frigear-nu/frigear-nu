import EmailTemplates from '../../../src/module'

export default defineNuxtConfig({
  modules: [EmailTemplates, './modules/fixture'],
  compatibilityDate: 'latest',
  emailTemplates: { brandName: 'Fixture Co', logoUrl: '/logo.png', siteUrl: 'https://cdn.example.test', colors: { danger: '#b91c1c' } },
  notify: { email: { driver: './server/utils/mail-driver' } },
})
