import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendAdminDashboard, extendAdminNav } from '../../../../src/runtime/utils'

export default defineNuxtModule({
  meta: { name: 'test-admin-contributions' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    extendAdminNav(nuxt, { label: 'Things', to: '/admin/things', order: 1 })
    extendAdminNav(nuxt, { label: 'Config', to: '/admin/config' }, 'settings')
    extendAdminDashboard(nuxt, { component: resolver.resolve('./runtime/StatsWidget.vue'), order: 1 })
  },
})
