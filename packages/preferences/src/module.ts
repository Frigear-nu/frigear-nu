import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addImports,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  extendDatabaseTable,
  inlineModuleRuntime,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { addSessionUserFilter, registerAccess } from '@frigear-nu/auth/utils'
import { setNotifyChoicesStore } from '@frigear-nu/notify/utils'
import { preferencesAccess } from './runtime/access'
import { addUserPreferences } from './runtime/utils/build'
import type { PreferenceDefinitionSource } from './runtime/utils/build'
import type { ModuleOptions, PreferencesPublicConfig } from './types'

export type { ModuleOptions, PreferencesDto, PreferencesPublicConfig, UserPreferences } from './types'
export type { PreferenceDefinition, PreferenceDefinitions, PreferencesOf } from './runtime/define'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    preferences?: ModuleOptions
  }
  interface PublicRuntimeConfig {
    preferences: PreferencesPublicConfig
  }
}

const MODULE_NAME = '@frigear-nu/preferences'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'preferences' },
  defaults: { pages: {} },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    // Notification channel choices: this module is notify's choices store, and the account page lists notify's topics.
    '@frigear-nu/notify': { version: '>=0.0.1' },
    // The account notifications page is built from its components (`PageHeading`, `TableCard`, `SwitchToggle`).
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/account': { version: '>=0.0.0', optional: true },
    // Only needed to forward preferences as claims; listed so it is installed before this module is set up.
    '@frigear-nu/oauth-server': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)

    // Notification channel choices per topic: stored as the `notificationChannels` preference (no table of its own) and
    // read by `notifyUser` of notify through the choices store.
    addUserPreferences(nuxt, { path: resolver.resolve('./runtime/notifications') })
    setNotifyChoicesStore(nuxt, resolver.resolve('./runtime/server/notify-choices'))
    // `managed` preferences (the choices) stay out of the session cookie: the notifications page reads them from its route.
    addSessionUserFilter(nuxt, resolver.resolve('./runtime/server/session-filter'))
    const notificationsPath = resolvePagePath(options.pages?.notifications ?? true, '/account/notifications')
    nuxt.options.runtimeConfig.public.preferences = { pages: { notifications: notificationsPath } }

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

    // `preferences:notifications`: the notification routes, also for API tokens and OAuth access tokens given it.
    registerAccess(nuxt, preferencesAccess)
    addModuleRoutes(resolver, [
      { method: 'patch', path: '', file: 'preferences.patch' },
      { method: 'get', path: 'notifications', file: 'notifications.get' },
      { method: 'patch', path: 'notifications', file: 'notifications.patch' },
    ], { base: '/api/preferences' })

    // --- Account page: the user's channels per notification topic ------------------------------------------------
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    addModulePages(MODULE_NAME, resolver, [
      { name: 'preferences-notifications', path: notificationsPath, file: './runtime/app/pages/notifications.vue' },
    ])
    if (notificationsPath) addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })

    if (hasNuxtModule('@frigear-nu/oauth-server')) {
      addServerPlugin(resolver.resolve('./runtime/server/plugins/oauth-claims'))
    }
  },
})
