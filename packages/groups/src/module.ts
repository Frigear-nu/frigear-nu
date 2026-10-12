import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import type { AuthorizeContext, ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    groups?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    groups: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Gate for managing groups and their members: set `ctx.allowed = true` to let the user in. Denied by default. */
    'groups:authorize': (ctx: AuthorizeContext) => void | Promise<void>
    /** A group was deleted (its memberships are already gone). Modules that reference groups clean up here. */
    'groups:deleted': (ctx: { groupId: string }) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/groups'

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'groups' },
  defaults: { settings: { pages: {} } },
  moduleDependencies: {
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the shared page components of the admin pages (`AdminPage`, `AdminTable`, ...).
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const adminPath = resolvePagePath(settings.pages?.admin, '/admin/groups')
    const adminGroupPath = resolvePagePath(settings.pages?.adminGroup, '/admin/groups/:id')

    nuxt.options.runtimeConfig.public.groups = { pages: { admin: adminPath, adminGroup: adminGroupPath } }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    for (const [method, path, file] of [
      ['get', '/groups', 'groups.get'],
      ['post', '/groups', 'groups.post'],
      ['get', '/groups/:id', 'group.get'],
      ['patch', '/groups/:id', 'group.patch'],
      ['delete', '/groups/:id', 'group.delete'],
      ['get', '/groups/:id/members', 'members.get'],
      ['post', '/groups/:id/members', 'members.post'],
      ['delete', '/groups/:id/members/:userId', 'member.delete'],
      ['get', '/users', 'users.get'],
    ] as const) {
      addServerHandler({ route: `/api/groups/admin${path}`, method, handler: resolver.resolve(`./runtime/server/routes/admin/${file}`) })
    }
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useGroupsPaths', from: resolver.resolve('./runtime/app/composables/useGroups') },
    ])

    const pages = [
      { name: 'groups-admin', path: adminPath, file: 'admin.vue' },
      { name: 'groups-admin-group', path: adminGroupPath, file: 'admin-group.vue' },
    ]
    if (pages.some(page => page.path)) {
      extendPages((existing) => {
        const taken = new Set(existing.map(page => page.path))
        for (const page of pages) {
          if (page.path && !taken.has(page.path)) {
            existing.push(defineModulePage(MODULE_NAME, { name: page.name, path: page.path, file: resolver.resolve(`./runtime/app/pages/${page.file}`) }))
          }
        }
      })
    }

    if (hasNuxtModule('@frigear-nu/menu')) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin' })
    }
  },
})
