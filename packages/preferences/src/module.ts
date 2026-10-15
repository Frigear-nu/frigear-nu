import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { extendDatabaseTable, registerModule, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import type { PreferenceDefinitionSource } from './runtime/utils/build'
import type { ModuleOptions } from './types'

export type { ModuleOptions, UserPreferences } from './types'
export type { PreferenceDefinition, PreferenceDefinitions, PreferencesOf } from './runtime/define'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    preferences?: ModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/preferences', configKey: 'preferences' },
  defaults: {},
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    // Only needed to forward preferences as claims; listed so it is installed before this module is set up.
    '@frigear-nu/oauth-server': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/preferences', nuxt)
    const resolver = createResolver(import.meta.url)

    // One JSON column on `users` holds every preference. Hosts must generate and commit their own migration.
    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // The definer files: the host's (option or `shared/preferences.ts`) plus whatever other modules register.
    // Resolved lazily so modules installed later can still register.
    const collectSources = async (): Promise<PreferenceDefinitionSource[]> => {
      const configured = [options.definitions ?? []].flat()
      const conventional = join(nuxt.options.rootDir, 'shared/preferences.ts')
      const paths = [
        ...await Promise.all(configured.map(path => resolver.resolvePath(path, { cwd: nuxt.options.rootDir }))),
        ...(!configured.length && existsSync(conventional) ? [conventional] : []),
      ]
      const sources: PreferenceDefinitionSource[] = paths.map(path => ({ path }))
      await nuxt.callHook('preferences:definitions', sources)
      return [...new Map(sources.map(source => [source.path, source])).values()]
    }

    addServerTemplate({
      filename: '#preferences/definitions',
      getContents: async () => {
        const sources = await collectSources()
        return [
          ...sources.map((source, index) => `import definitions${index} from ${JSON.stringify(source.path)}`),
          `export const definitions = [${sources.map((_, index) => `definitions${index}`).join(', ')}]`,
        ].join('\n')
      },
    })

    // Types: every registered key becomes part of `UserPreferences`, derived from the schemas themselves, and the
    // session user carries them.
    addTypeTemplate({
      filename: 'types/preferences.d.ts',
      getContents: async () => {
        const sources = await collectSources()
        const extend = sources.length
          ? ` extends ${sources.map(source => `PreferencesOf<typeof import(${JSON.stringify(source.path)}).default>`).join(', ')}`
          : ''
        return `import type { PreferencesOf } from '${resolver.resolve('./runtime/define')}'
import type { UserPreferences as RegisteredPreferences } from '@frigear-nu/preferences'

declare module '@frigear-nu/preferences' {
  interface UserPreferences${extend} {}
}
declare module '#auth-utils' {
  interface User {
    preferences?: RegisteredPreferences
  }
}
declare module '#preferences/definitions' {
  export const definitions: Array<import('${resolver.resolve('./runtime/define')}').PreferenceDefinitions>
}
`
      },
    }, { nitro: true, nuxt: true })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    addImports({ name: 'useUserPreferences', from: resolver.resolve('./runtime/app/composables/useUserPreferences') })

    addServerHandler({
      route: '/api/preferences',
      method: 'patch',
      handler: resolver.resolve('./runtime/server/routes/preferences.patch'),
    })

    if (hasNuxtModule('@frigear-nu/oauth-server')) {
      addServerPlugin(resolver.resolve('./runtime/server/plugins/oauth-claims'))
    }
  },
})
