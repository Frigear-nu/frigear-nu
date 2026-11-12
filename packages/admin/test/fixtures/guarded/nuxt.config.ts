import AdminModule from '../../../src/module'
import AuthorizationStub from './modules/authorization-stub'

// The admin area as it is wired when `@frigear-nu/authorization` is installed.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', AuthorizationStub, AdminModule],
  runtimeConfig: { session: { password: 'a-test-only-session-password-at-least-32-chars' } },
})
