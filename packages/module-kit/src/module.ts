import { defineNuxtModule, createResolver } from '@nuxt/kit'

export * from './runtime/utils/index'

// Module options TypeScript interface definition
export interface ModuleOptions {
  _modules?: string[]
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

    _nuxt.options.moduleKit ||= {}
    _nuxt.options.moduleKit._modules = [
      ...new Set([
        ...(_nuxt.options.moduleKit._modules ?? []),
        ...(_options._modules ?? []),
      ]),
    ]
  },
})
