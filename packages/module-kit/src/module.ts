import { defineNuxtModule, createResolver } from '@nuxt/kit'
import { defu } from 'defu'

// Module options TypeScript interface definition
export interface ModuleOptions {
  _modules?: string[]
}

declare module '@nuxt/schema' {
  interface NuxtConfig {
    moduleKit?: ModuleOptions
  }
  interface NuxtOptions {
    moduleKit?: ModuleOptions
  }
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
})
