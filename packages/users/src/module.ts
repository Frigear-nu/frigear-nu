import { defu } from 'defu'
import {
  addImports,
  addImportsDir,
  addServerHandler,
  createResolver,
  defineNuxtModule,
  extendPages,
} from '@nuxt/kit'
import { extendDatabaseTable, moduleApiUrl, moduleUrl } from '@frigear-nu/module-kit/utils'
import { objectPick } from '@vueuse/core'
import type { NuxtPage } from '@nuxt/schema'

type SharedModuleOptions = {
  schema?: boolean
  login?: string
  register?: string | boolean
  middleware?: boolean
}
type ModuleServerOptions = SharedModuleOptions & {
  mode: 'server'
}
type ModuleClientOptions = SharedModuleOptions & {
  mode: 'client'
  mapFromHttp?: string
}

type PublicModuleOptions = {
  mode: 'server' | 'client'
  login?: string
  register?: string | boolean
  middleware?: boolean
}

export type ModuleOptions = ModuleServerOptions | ModuleClientOptions

declare module 'nuxt/schema' {
  interface RuntimeConfig {
    users?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    users: PublicModuleOptions
  }
}

const moduleName = 'users'
export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: `@frigear-nu/${moduleName}`,
    configKey: moduleName,
  },
  defaults: {
    mode: 'server',
    schema: true,
    login: '/login',
    register: false,
    middleware: true,
  },
  moduleDependencies: {
    '@frigear-nu/module-kit': {},
    '@nuxthub/core': {
      optional: true, // might not be required in consuming client side app?
      defaults: {
        db: {
          dialect: 'sqlite',
          casing: 'snake_case',
        },
        kv: true,
      },
    },
    '@nuxt/ui': {}, // not sure.. but we need it for typing...
    'nuxt-auth-utils': {
      defaults: {
        webauthn: true,
      },
    },
  },
  async setup(_options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const options = nuxt.options.users = defu(
      nuxt.options?.users as ModuleOptions,
      nuxt.options.runtimeConfig?.users as ModuleOptions,
      _options,
    ) as ModuleOptions

    // So this can be consumed in components
    nuxt.options.runtimeConfig.public.users = defu(
      nuxt.options.runtimeConfig.public.users as PublicModuleOptions,
      objectPick(options, ['mode', 'login', 'register', 'middleware']) as PublicModuleOptions,
    ) as PublicModuleOptions

    // ..
    if (options.mode === 'client') {
      console.log('Users module is running in client mode - will be built accordingly to support oauth.')
    }
    else if (options.mode === 'server') {
      // ...
      if (options.schema) {
        // Ensure we have the default user table:
        await extendDatabaseTable(nuxt, {
          name: moduleName,
          factory: 'defineUsersTable',
          resolver,
          schema: dialect => `./runtime/server/db/schema.${dialect}`,
        })
      }

      const pages: NuxtPage[] = []

      if (options.login) {
        pages.push({
          name: `${moduleName}-login`,
          path: options.login,
          file: resolver.resolve('./runtime/app/pages/login.vue'),
        })
      }

      if (options.register) {
        pages.push({
          name: `${moduleName}-register`,
          path: typeof options.register === 'string'
            ? options.register
            : moduleUrl(moduleName, '/register'),
          file: resolver.resolve('./runtime/app/pages/register.vue'),
        })
      }

      extendPages((paths) => {
        for (const page of pages) {
          if (!paths.some(p => p.path === page.path)) {
            paths.push(page)
          }
        }
      })

      if (options.middleware) {
      // Add the session middleware
        addServerHandler({
          middleware: true,
          handler: resolver.resolve('./runtime/server/middleware/session'),
        })
      }

      // this can be overridden by the consuming app if needed, but we provide a default implementation for convenience
      addImports([
        {
          name: 'useUserLogin',
          from: resolver.resolve('./runtime/app/composables/useUserLogin'),
        },
        {
          name: 'useUserRegistration',
          from: resolver.resolve('./runtime/app/composables/useUserRegistration'),
        },
      ])
    }
  },
})
