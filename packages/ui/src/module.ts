import { defineNuxtModule, createResolver, addComponentsDir, addImportsDir, hasNuxtModule } from '@nuxt/kit'
import { registerTailwindSource } from '@frigear-nu/module-kit/utils'
import { defaultI18nConfig } from './internal/utils'

const resolver = createResolver(import.meta.url)

export default defineNuxtModule({
  meta: {
    name: '@frigear-nu/ui',
    configKey: 'frigearUi',
    version: '0.0.1',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  moduleDependencies: {
    '@nuxt/ui': {},
    '@frigear-nu/module-kit': {},
    // Only needed for `MonacoCodeEditor`, which is registered when the host installs `nuxt-monaco-editor` itself.
    'nuxt-monaco-editor': {
      optional: true,
    },
    '@nuxtjs/i18n': {
      optional: true,
    },
  },
  setup(_options, nuxt) {
    // Tailwind must see the classes of these components, wherever the package is installed.
    registerTailwindSource(nuxt, resolver.resolve('./runtime'))

    // Register global components (available everywhere without importing)
    addComponentsDir({
      path: resolver.resolve('./runtime/components/global'),
      global: true,
      prefix: '',
      ignore: hasNuxtModule('nuxt-monaco-editor', nuxt) ? [] : ['**/MonacoCodeEditor.vue'],
    })

    // Register non-global components (lazy-imported on demand)
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      prefix: '',
      ignore: ['global/**'],
    })

    // Auto-import composables and the pure helpers (`errorMessage`, `formatDate`, `statusColor`, …)
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))
  },
  hooks: {
    'i18n:registerModule': (register) => {
      register(defaultI18nConfig(resolver))
    },
  },
})
