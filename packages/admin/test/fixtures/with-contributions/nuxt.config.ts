import AdminModule from '../../../src/module'
import TestModule from './modules/test-module'

// Without @frigear-nu/authorization the area is unguarded, so the guard is switched off explicitly.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', AdminModule, TestModule],
  runtimeConfig: { session: { password: 'a-test-only-session-password-at-least-32-chars' } },
  admin: { settings: { roles: false } },
})
