import { defineNuxtModule, createResolver, addComponentsDir, addImportsDir, addPlugin, hasNuxtModule } from '@nuxt/kit'
import { addOptionalImports, inlineModuleRuntime, registerTailwindSource } from '@frigear-nu/module-kit/utils'
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
    inlineModuleRuntime(nuxt, resolver)

    // Tailwind must see the classes of these components, wherever the package is installed.
    registerTailwindSource(nuxt, resolver.resolve('./runtime'))

    // Every component is a lazy auto-import, resolved by name where it is used. None is registered with
    // `global: true`: a global component is bundled into the app entry and transformed before the first
    // render of every page, and none of these is referenced dynamically (Nuxt Content, `resolveComponent`).
    addComponentsDir({
      path: resolver.resolve('./runtime/components'),
      prefix: '',
      pathPrefix: false,
      ignore: hasNuxtModule('nuxt-monaco-editor', nuxt) ? [] : ['**/MonacoCodeEditor.vue'],
    })

    // Auto-import composables and the pure helpers (`errorMessage`, `formatDate`, `statusColor`, …)
    addImportsDir(resolver.resolve('./runtime/composables'))
    addImportsDir(resolver.resolve('./runtime/utils'))

    // `useCachedFetch`'s responses belong to the signed-in user: forgotten when they sign out or another user signs in.
    // Who is signed in comes from `@frigear-nu/auth` (either mode), checked once every module is installed.
    addOptionalImports(nuxt, '#ui/optional', [
      {
        name: 'useUserSession',
        available: () => hasNuxtModule('@frigear-nu/auth', nuxt) || hasNuxtModule('nuxt-auth-utils', nuxt),
        fallback: 'undefined',
        fallbackType: `undefined | (() => { user: import('vue').Ref<unknown> })`,
      },
    ])
    addPlugin({ src: resolver.resolve('./runtime/plugins/cached-fetch-owner.client'), mode: 'client' })
  },
  hooks: {
    'i18n:registerModule': (register) => {
      register(defaultI18nConfig(resolver))
    },
  },
})
