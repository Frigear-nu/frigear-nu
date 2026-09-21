import { defineNuxtModule, createResolver, addComponentsDir, addImportsDir } from '@nuxt/kit'
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
    'nuxt-monaco-editor': {},
    '@nuxtjs/i18n': {
      optional: true,
      defaults: defaultI18nConfig(resolver),
    },
  },
  setup(_options, _nuxt) {
    // Register global components (available everywhere without importing)
    addComponentsDir({
      path: resolver.resolve('./runtime/components/global'),
      global: true,
      prefix: '',
    })

    // Register non-global components (lazy-imported on demand)
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      prefix: '',
      ignore: ['global/**'],
    })

    // Auto-import composables
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))
  },
  hooks: {
    'i18n:registerModule': (register) => {
      register(defaultI18nConfig(resolver))
    },
  },
})
