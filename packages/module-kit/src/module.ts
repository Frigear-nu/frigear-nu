import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defu } from 'defu'

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
    _nuxt.options.moduleKit._modules = defu(
      _nuxt.options.moduleKit?._modules || [],
      _options._modules || [],
    ) as string[]
  },
  hooks: {
    'module:done': (_module) => {
      // Ensure we call any setup functionality, register migrations etc...?
    },
  },
})
