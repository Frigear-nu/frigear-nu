import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendWidgets } from '../../../../src/runtime/utils/widget'

export default defineNuxtModule({
  meta: { name: 'test-widgets' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    extendWidgets(nuxt, 'demo', [
      { component: resolver.resolve('./runtime/WidgetSecond.vue'), order: 2, props: { label: 'from-props' } },
      { component: resolver.resolve('./runtime/WidgetFirst.vue'), order: 1 },
      { component: resolver.resolve('./runtime/WidgetSecret.vue'), id: 'secret', requires: 'secret' },
    ])
  },
})
