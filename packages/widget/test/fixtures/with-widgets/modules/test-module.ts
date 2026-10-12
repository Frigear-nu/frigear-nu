import { createResolver, defineNuxtModule } from '@nuxt/kit'
import { extendWidgets } from '../../../../src/runtime/utils/widget'
import { extendTabs } from '../../../../src/runtime/utils/tab'

export default defineNuxtModule({
  meta: { name: 'test-widgets' },
  setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)

    extendWidgets(nuxt, 'demo', [
      { component: resolver.resolve('./runtime/WidgetSecond.vue'), order: 2, props: { label: 'from-props' } },
      { component: resolver.resolve('./runtime/WidgetFirst.vue'), order: 1 },
      { component: resolver.resolve('./runtime/WidgetSecret.vue'), id: 'secret', requires: 'secret' },
    ])

    // Tabs live in their own list: the same area name holds the widgets above and these tabs.
    extendTabs(nuxt, 'demo', [
      { component: resolver.resolve('./runtime/TabSecond.vue'), order: 2, label: 'Second tab', labelKey: 'missing.key' },
      { component: resolver.resolve('./runtime/TabFirst.vue'), order: 1, label: 'First tab' },
      { component: resolver.resolve('./runtime/WidgetSecret.vue'), id: 'secret-tab', label: 'Secret tab', requires: 'secret' },
    ])
    // A second module-style registration into the same area, replacing nothing.
    extendTabs(nuxt, 'demo', { component: resolver.resolve('./runtime/TabThird.vue'), order: 3 })
  },
})
