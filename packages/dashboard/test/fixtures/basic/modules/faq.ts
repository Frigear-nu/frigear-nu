import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendDashboard } from '../../../../src/runtime/utils'

// Stands in for a second module (FAQ) adding to the same dashboard.
export default defineNuxtModule({
  meta: { name: 'test-faq' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    extendDashboard(nuxt, 'crew.home', [
      { id: 'faq.latest', component: resolver.resolve('./runtime/LatestAnswers.vue'), title: 'Latest answers', titleKey: 'missing.key', order: 20, span: 2 },
      { id: 'faq.web', component: resolver.resolve('./runtime/Marker.vue'), title: 'Web only', order: 40, props: { marker: 'item-web-only' }, platforms: ['web'] },
      { id: 'faq.with-shifts', component: resolver.resolve('./runtime/Marker.vue'), title: 'With shifts', order: 50, props: { marker: 'item-when-present' }, when: { module: 'test-shifts', platform: 'web' } },
    ])
  },
})
