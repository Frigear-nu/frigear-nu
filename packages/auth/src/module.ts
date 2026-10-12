import {
  addServerHandler,
  addServerImportsDir,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import { moduleApiUrl, registerDatabaseTable } from '@frigear-nu/module-kit/utils'
import type { AuthResolverDefinition, AuthScopeDefinition, ModuleOptions } from './types'
import type { AuthUserLoaderRegistration } from './runtime/utils/build'

export type { AuthResolverDefinition, AuthScopeDefinition, ModuleOptions } from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authentication?: ModuleOptions
  }

  interface RuntimeConfig {
    authentication?: { tokenTtlDays: number | null }
  }
}

export default defineNuxtModule<ModuleOptions>({
  // Not `auth`: that key belongs to nuxt-auth-utils.
  meta: { name: '@frigear-nu/auth', configKey: 'authentication' },
  defaults: {
    tokenTtlDays: null,
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.0.1',
    },
    '@frigear-nu/module-kit': {
      version: '>=0.0.1',
    },
    'nuxt-auth-utils': {
      version: '>=0.0.1',
      defaults: { webAuthn: true },
    },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    await registerDatabaseTable(nuxt, {
      name: ['authUserTokens'],
      resolver,
      schema: dialect => `./runtime/db/schema.${dialect}`,
    })

    nuxt.options.runtimeConfig.authentication = { tokenTtlDays: options.tokenTtlDays ?? null }

    // Bearer resolvers: the built-in user-token one plus whatever other modules register.
    addServerTemplate({
      filename: '#auth/resolvers',
      getContents: async () => {
        const registered: AuthResolverDefinition[] = [{
          name: 'user-token',
          prefix: 'fnu_',
          order: 50,
          resolver: resolver.resolve('./runtime/server/resolvers/user-token'),
        }]
        await nuxt.callHook('auth:resolvers', registered)
        return [
          ...registered.map((definition, index) => `import resolve${index} from ${JSON.stringify(definition.resolver)}`),
          `export const resolvers = [${registered.map((definition, index) => `{ name: ${JSON.stringify(definition.name)}, prefix: ${JSON.stringify(definition.prefix)}, jwt: ${definition.jwt === true}, order: ${definition.order ?? 100}, resolve: resolve${index} }`).join(', ')}]`,
        ].join('\n')
      },
    })

    // Scopes user tokens can be granted: the host's plus those modules declare.
    addServerTemplate({
      filename: '#auth/scopes',
      getContents: async () => {
        const registered: AuthScopeDefinition[] = [...(options.scopes ?? [])]
        await nuxt.callHook('auth:scopes', registered)
        const unique = [...new Map(registered.map(scope => [scope.name, scope])).values()]
        return `export const scopes = ${JSON.stringify(unique)}`
      },
    })

    // How a user is loaded by id (provided by `@frigear-nu/users`, overridable by the host).
    addServerTemplate({
      filename: '#auth/user-loader',
      getContents: async () => {
        const registration: AuthUserLoaderRegistration = {}
        await nuxt.callHook('auth:user-loader', registration)
        const path = options.userLoader
          ? await resolver.resolvePath(options.userLoader, { cwd: nuxt.options.rootDir })
          : registration.path
        return path ? `export { default } from ${JSON.stringify(path)}` : 'export default async () => null'
      },
    })

    addTypeTemplate({
      filename: 'types/auth-virtual.d.ts',
      getContents: () => `declare module '#auth/resolvers' {
  export const resolvers: Array<{
    name: string
    prefix?: string
    jwt?: boolean
    order?: number
    resolve: import('${resolver.resolve('./types')}').AuthResolverFn
  }>
}
declare module '#auth/scopes' {
  export const scopes: Array<{ name: string, description?: string }>
}
declare module '#auth/user-loader' {
  const loadUser: (id: string) => Promise<import('#auth-utils').User | null>
  export default loadUser
}
export {}
`,
    }, { nitro: true, nuxt: true })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addServerHandler({
      middleware: true,
      handler: resolver.resolve('./runtime/server/middleware/auth'),
    })

    for (const [method, path, file] of [
      ['get', 'tokens', 'tokens.get'],
      ['post', 'tokens', 'tokens.post'],
      ['delete', 'tokens/:id', 'token.delete'],
      ['get', 'scopes', 'scopes.get'],
    ] as const) {
      addServerHandler({ route: moduleApiUrl('auth', path), method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })
    }
  },
})
