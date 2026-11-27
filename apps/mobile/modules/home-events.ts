import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendWidgets } from '@frigear-nu/widget/utils'

// The website's upcoming events on the signed-in Home tab too, below the next shift: the `dashboard.home` widget area of
// @frigear-nu/dashboard's Home page (the same list as the public home).
export default defineNuxtModule({
  meta: { name: 'app-home-events' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    extendWidgets(nuxt, 'dashboard.home', {
      id: 'app-events',
      component: resolver.resolve('../app/components/home/HomeEvents.vue'),
    })
  },
})
