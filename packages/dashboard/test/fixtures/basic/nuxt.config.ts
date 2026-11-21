import DashboardModule from '../../../src/module'
import ShiftsModule from './modules/shifts'
import FaqModule from './modules/faq'

// Two stand-in modules each add items to `crew.home`. No Preferences: layouts live in `useState` (seeded per request
// by `plugins/layout.ts`). No Mobile: the platform is `web` and no Home tab is registered.
export default defineNuxtConfig({
  modules: ['@nuxt/ui', DashboardModule, ShiftsModule, FaqModule],
})
