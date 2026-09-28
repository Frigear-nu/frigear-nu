import type { ModuleOptions } from './module'

declare module '@nuxt/schema' {
  interface NuxtOptions {
    moduleKit: ModuleOptions | false
  }

  interface NuxtConfig {
    moduleKit?: Partial<ModuleOptions> | false
  }
}

declare module 'nuxt/schema' {
  interface NuxtOptions {
    moduleKit: ModuleOptions | false
  }

  interface NuxtConfig {
    moduleKit?: Partial<ModuleOptions> | false
  }
}

export {}
