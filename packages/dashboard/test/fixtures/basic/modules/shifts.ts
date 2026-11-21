import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendDashboard } from '../../../../src/runtime/utils'

// Stands in for a shifts module adding its items to the volunteer Home dashboard.
export default defineNuxtModule({
  meta: { name: 'test-shifts' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    extendDashboard(nuxt, 'crew.home', [
      { id: 'shifts.next', component: resolver.resolve('./runtime/NextShift.vue'), title: 'Next shift', order: 10, props: { when: 'Saturday' } },
      { id: 'shifts.staff', component: resolver.resolve('./runtime/Marker.vue'), title: 'Staff only', order: 30, props: { marker: 'item-staff' }, permission: 'shifts:manage' },
      { id: 'shifts.mobile', component: resolver.resolve('./runtime/Marker.vue'), title: 'Mobile only', order: 35, props: { marker: 'item-mobile-only' }, platforms: ['mobile'] },
      { id: 'shifts.absent', component: resolver.resolve('./runtime/Marker.vue'), title: 'Absent module', order: 36, props: { marker: 'item-when-absent' }, when: { module: 'not-installed-module' } },
      { id: 'shifts.hours', component: resolver.resolve('./runtime/Hours.vue'), title: 'Hours worked', order: 60 },
    ])
  },
})
