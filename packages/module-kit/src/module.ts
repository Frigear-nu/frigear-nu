import { defineNuxtModule, createResolver, addImports, addNitroPlugin, getNitroVersion } from '@nuxt/kit'
import { inlineModuleRuntime } from './runtime/utils/server'

export * from './runtime/utils/index'

// Module options TypeScript interface definition
export interface ModuleOptions {
  _modules?: string[]
  /**
   * The app is client only: a static build with no server of its own that calls a remote API (see `isClientOnlyApp`).
   * Modules then leave out their server routes, Nitro plugins, database tables and server policies. Unset: on when the
   * app lists `@frigear-nu/mobile` in `modules`.
   */
  clientOnly?: boolean
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: '@frigear-nu/module-kit',
    configKey: 'moduleKit',
    compatibility: {
      nuxt: '>=4.0.0',
    },
  },
  // Default configuration options of the Nuxt module
  defaults: {
    _modules: [],
  },
  setup(_options, _nuxt) {
    const _resolver = createResolver(import.meta.url)
    inlineModuleRuntime(_nuxt, _resolver)

    addImports({ name: 'useModuleT', from: _resolver.resolve('./runtime/composables/useModuleT') })

    // Previews get the i18n base URL from the request origin; a no-op without `@nuxtjs/i18n` or with a base URL set.
    // Nitro v3's runtime config is one object for every request, so setting it per request would leak between them.
    if (getNitroVersion(_nuxt) !== 3) addNitroPlugin(_resolver.resolve('./runtime/server/plugins/i18n-base-url'))

    _nuxt.options.moduleKit ||= {}
    _nuxt.options.moduleKit._modules = [
      ...new Set([
        ...(_nuxt.options.moduleKit._modules ?? []),
        ...(_options._modules ?? []),
      ]),
    ]
  },
})
