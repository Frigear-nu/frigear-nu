import AdminModule from '../../../src/module'

// The app defines its own `admin` layout: it replaces the module's, while the module's route rule still applies it.
// Without @frigear-nu/authorization the area is unguarded, so the guard is switched off explicitly.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', AdminModule],
  runtimeConfig: { session: { password: 'a-test-only-session-password-at-least-32-chars' } },
  admin: { settings: { roles: false } },
})
