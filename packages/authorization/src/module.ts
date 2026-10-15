import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addComponentsDir,
  addImports,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { extendDatabaseTable, registerModule, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import { ROUTE_RULE_KEYS } from './runtime/utils/types'
import type { AuthorizationRouteRules, ModuleOptions, PublicModuleOptions } from './types'

export type { AuthorizationRouteRules, ModuleOptions, PublicModuleOptions } from './types'
export type { Ability, AbilityArgs, AuthorizeMeta, RouteRule, AuthorizationResponse } from './runtime/utils/types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authorization?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    authorization?: PublicModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/authorization', configKey: 'authorization' },
  defaults: {
    resolvers: {},
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
    },
    '@frigear-nu/module-kit': {
      version: '>=0.0.1',
    },
    '@frigear-nu/auth': {
      version: '>=0.0.1',
    },
    '@frigear-nu/users': {
      version: '>=0.0.1',
    },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/authorization', nuxt)
    const resolver = createResolver(import.meta.url)

    nuxt.options.runtimeConfig.public.authorization = {
      routes: {},
      redirectTo: options.redirectTo,
    }

    // Rules are keys on the native `routeRules` (`'/admin/**': { roles: ['admin'] }`). Nuxt's app-side route
    // rules matcher only keeps known keys, so they are collected here (once every module has had its say)
    // and shipped through public runtime config.
    nuxt.hook('modules:done', () => {
      const routes: Record<string, AuthorizationRouteRules> = {}
      const sources = [nuxt.options.routeRules, nuxt.options.nitro?.routeRules]
      for (const [pattern, rule] of sources.flatMap(source => Object.entries(source ?? {}))) {
        const picked = Object.fromEntries(ROUTE_RULE_KEYS
          .filter(key => (rule as Record<string, unknown>)[key] !== undefined)
          .map(key => [key, (rule as Record<string, unknown>)[key]]))
        if (Object.keys(picked).length) routes[pattern] = { ...routes[pattern], ...picked }
      }
      nuxt.options.runtimeConfig.public.authorization = { routes, redirectTo: options.redirectTo }
    })

    // `users.role` (default 'user'). Host apps must generate and commit their own migration.
    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // Resolvers: the configured function (or the nuxt-auth-utils session user) is re-exported through
    // virtual modules so the runtime can import it statically, like `#users/session-mapper`.
    const resolverSource = async (configured: string | undefined, fallback: string) => {
      const target = configured
        ? await resolver.resolvePath(configured, { cwd: nuxt.options.rootDir })
        : resolver.resolve(fallback)
      return `export { default } from ${JSON.stringify(target)}`
    }

    // Abilities registry: lets `routes` and `definePageMeta({ authorize: 'name' })` refer to abilities by name.
    const abilitiesFile = options.abilities
      ? await resolver.resolvePath(options.abilities, { cwd: nuxt.options.rootDir })
      : ['shared/utils/abilities.ts', 'shared/abilities.ts'].map(file => join(nuxt.options.rootDir, file)).find(existsSync)
    const abilitiesSource = abilitiesFile
      ? `import * as abilities from ${JSON.stringify(abilitiesFile)}\nexport { abilities }`
      : 'export const abilities = {}'

    addServerTemplate({
      filename: '#authorization/server-resolver',
      getContents: () => resolverSource(options.resolvers?.server, './runtime/server/resolver'),
    })
    addServerTemplate({
      filename: '#authorization/abilities',
      getContents: () => abilitiesSource,
    })
    addTemplate({
      filename: 'authorization/client-resolver.mjs',
      write: true,
      getContents: () => resolverSource(options.resolvers?.client, './runtime/app/resolver'),
    })
    addTemplate({
      filename: 'authorization/abilities.mjs',
      write: true,
      getContents: () => abilitiesSource,
    })

    // Types: virtual modules + the `role` column on the session user.
    addTypeTemplate({
      filename: 'types/authorization-virtual.d.ts',
      getContents: () => `declare module '#authorization/server-resolver' {
  const resolveServerUser: (event: import('h3').H3Event) => unknown | Promise<unknown>
  export default resolveServerUser
}
declare module '#authorization/abilities' {
  export const abilities: Record<string, unknown>
}
declare module '#build/authorization/client-resolver.mjs' {
  const resolveClientUser: () => unknown | Promise<unknown>
  export default resolveClientUser
}
declare module '#build/authorization/abilities.mjs' {
  export const abilities: Record<string, unknown>
}
`,
    }, { nitro: true, nuxt: true })
    addTypeTemplate({
      filename: 'types/authorization-user.d.ts',
      getContents: () => `declare module '#auth-utils' {
  interface User {
    role: string
  }
}
export {}
`,
    }, { nitro: true, nuxt: true })

    // Shared policy helpers (client + server).
    const abilityImports = ['defineAbility', 'allow', 'deny'].map(name => ({
      name,
      from: resolver.resolve('./runtime/utils/ability'),
    }))
    addImports(abilityImports)
    addServerImports(abilityImports)

    // Client: `allows`, `denies`, `authorize`, `useAuthorization`.
    addImports(['allows', 'denies', 'authorize', 'useAuthorization'].map(name => ({
      name,
      from: resolver.resolve('./runtime/app/composables/useAuthorization'),
    })))
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // Server: `allows(event, ...)`, `denies(event, ...)`, `authorize(event, ...)`.
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    addRouteMiddleware({
      name: 'authorization',
      path: resolver.resolve('./runtime/app/middleware/authorization.global'),
      global: true,
    })

    // Cheap when no `routeRules` carry an `authorization` entry: only `/api/**` requests are inspected.
    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware/authorization'),
    })
  },
})
