import { defineNuxtModule } from '@nuxt/kit'
import { defineMobileTab, extendMobileTabs } from '../../../../src/runtime/utils'

// A module adding its tabs: they follow the app's own unless they set `order`, and relabel tabs by id.
export default defineNuxtModule({
  meta: { name: 'fixture-tabs' },
  setup(_options, nuxt) {
    extendMobileTabs(nuxt, [
      defineMobileTab({ id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar' }),
      { id: 'tickets', to: '/tickets', label: 'Tickets', icon: 'i-lucide-ticket', order: 1 },
    ])
    extendMobileTabs(nuxt, { id: 'home', label: 'Start' } as never)
  },
})
