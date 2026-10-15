import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendAdminDashboard, extendAdminNav } from '@frigear-nu/admin/utils'

// Registers stand-ins for the nav entries and widgets other modules contribute, to see the nav groups and the
// three dashboard areas.
export default defineNuxtModule({
  meta: { name: 'playground-demo-widgets' },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    extendAdminNav(nuxt, { label: 'Users', to: '/admin/demo', icon: 'i-lucide-users', order: 10, description: 'Page patterns demo.' })
    extendAdminNav(nuxt, { label: 'Applications', to: '/admin/applications', icon: 'i-lucide-key-round', order: 10 }, 'settings')
    extendAdminDashboard(nuxt, [
      { id: 'stat-members', component: resolve('../widgets/DemoStat.vue'), order: 10, props: { label: 'New members', icon: 'i-lucide-user-plus', value: '24', hint: '1 204 users in total' } },
      { id: 'stat-events', component: resolve('../widgets/DemoStat.vue'), order: 20, props: { label: 'Upcoming events', icon: 'i-lucide-calendar-days', value: '3' } },
      { id: 'stat-revenue', component: resolve('../widgets/DemoStat.vue'), order: 30, props: { label: 'Revenue, 30 days', icon: 'i-lucide-circle-dollar-sign', value: 'kr 48 250', hint: '57 transactions' } },
    ], 'top')
    extendAdminDashboard(nuxt, { id: 'members', component: resolve('../widgets/DemoList.vue'), order: 10, props: { title: 'New members', description: 'Signed up in the last 30 days.', rows: ['Ada Lovelace · ada@example.com', 'Grace Hopper · grace@example.com', 'Linus T · linus@example.com', 'Margaret H · margaret@example.com'] } })
    extendAdminDashboard(nuxt, [
      { id: 'events', component: resolve('../widgets/DemoList.vue'), order: 10, props: { title: 'Upcoming events', rows: ['Spring meetup', 'Summer camp'] } },
      { id: 'tx', component: resolve('../widgets/DemoList.vue'), order: 20, props: { title: 'Recent transactions', rows: [] } },
    ], 'side')
  },
})
