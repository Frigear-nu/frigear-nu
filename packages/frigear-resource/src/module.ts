import { addServerHandler, addServerImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit'
import { inlineModuleRuntime, registerModule } from '@frigear-nu/module-kit/utils'
import { addAuthResolver } from '@frigear-nu/auth/utils'
import { DEFAULT_AUDIENCE, DEFAULT_CORS_ORIGINS, isExactOrigin, parseList, resolveIssuerUrls } from './runtime/utils'
import type { FrigearResourceRuntimeConfig, ModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    frigearResource?: ModuleOptions
  }

  interface RuntimeConfig {
    frigearResource: FrigearResourceRuntimeConfig
  }
}

const MODULE_NAME = '@frigear-nu/frigear-resource'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'frigearResource' },
  defaults: {},
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // The user store unknown users are provisioned into.
    '@frigear-nu/users': { version: '>=0.0.1' },
  },
  setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)

    const corsOrigins = parseList(options.corsOrigins ?? [...DEFAULT_CORS_ORIGINS])
    for (const origin of corsOrigins) {
      if (!isExactOrigin(origin)) {
        throw new Error(`[${MODULE_NAME}] corsOrigins must be exact origins such as "https://app.example.com" or "capacitor://localhost", got "${origin}".`)
      }
    }

    // Module options are the defaults; what the host put in `runtimeConfig.frigearResource` (and env) wins.
    const urls = resolveIssuerUrls(options)
    const existing = nuxt.options.runtimeConfig.frigearResource as Partial<FrigearResourceRuntimeConfig> | undefined
    nuxt.options.runtimeConfig.frigearResource = {
      issuer: urls.issuer,
      // Derived from the issuer at request time when empty, so overriding only the issuer through env is enough.
      jwksUrl: options.jwksUrl ?? '',
      userinfoUrl: options.userinfoUrl ?? '',
      audience: parseList(typeof options.audience === 'string' ? [options.audience] : options.audience ?? [DEFAULT_AUDIENCE]),
      corsOrigins,
      corsPaths: parseList(options.corsPaths ?? ['/api/']),
      forceId: options.forceId ?? '',
      jwksCacheTtl: options.jwksCacheTtl ?? 600,
      ...existing,
    }

    // frigear.nu access tokens authenticate API calls as the user; checked before other JWT resolvers.
    addAuthResolver(nuxt, {
      name: 'frigear-access-token',
      jwt: true,
      order: 50,
      resolver: resolver.resolve('./runtime/server/resolvers/frigear-access-token'),
    })
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/frigear-resource-cors') })
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
  },
})
