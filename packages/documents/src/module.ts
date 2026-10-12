import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import type { AuthorizeContext, DocumentsRuntimeConfig, ModuleOptions, PublicModuleOptions } from './types'
import { DEFAULT_ACCEPT } from './runtime/utils'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    documents?: ModuleOptions
  }

  interface RuntimeConfig {
    documents: DocumentsRuntimeConfig
  }

  interface PublicRuntimeConfig {
    documents: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Gate for managing documents (and seeing all of them): set `ctx.allowed = true` to let the user in. Denied by default. */
    'documents:authorize': (ctx: AuthorizeContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/documents'
const DEFAULT_MAX_FILE_SIZE = 25 * 1024 * 1024

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'documents' },
  defaults: { settings: { pages: {} } },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      defaults: { blob: true },
    },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/groups': { version: '>=0.0.0' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the shared page components of the admin page (`AdminPage`, `AdminTable`, ...).
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const settings = options.settings ?? {}
    const documentsPath = resolvePagePath(settings.pages?.documents, '/account/documents')
    const adminPath = resolvePagePath(settings.pages?.admin, '/admin/documents')

    nuxt.options.runtimeConfig.documents = {
      maxFileSize: settings.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      accept: settings.accept ?? DEFAULT_ACCEPT,
    }
    nuxt.options.runtimeConfig.public.documents = { pages: { documents: documentsPath, admin: adminPath } }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    for (const [method, path, file] of [
      ['get', '', 'documents.get'],
      ['get', '/:id/download', 'download.get'],
      ['get', '/admin/items', 'admin/items.get'],
      ['post', '/admin/items', 'admin/items.post'],
      ['post', '/admin/items/upload', 'admin/upload.post'],
      ['patch', '/admin/items/:id', 'admin/item.patch'],
      ['delete', '/admin/items/:id', 'admin/item.delete'],
      ['get', '/admin/groups', 'admin/groups.get'],
    ] as const) {
      addServerHandler({ route: `/api/documents${path}`, method, handler: resolver.resolve(`./runtime/server/routes/${file}`) })
    }
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addServerPlugin(resolver.resolve('./runtime/server/plugins/groups-cleanup'))

    // --- App runtime ----------------------------------------------------------------------
    addImports(['useDocumentsPaths', 'useDocumentText', 'formatFileSize'].map(name => ({
      name,
      from: resolver.resolve('./runtime/app/composables/useDocuments'),
    })))

    // The browse page nests under the account layout (header + menu title) when `@frigear-nu/account` provides it.
    // `pages:resolved` runs after every module extended the pages, so the module order does not matter.
    nuxt.hook('pages:resolved', (pages) => {
      const taken = new Set(pages.flatMap(page => [page.path, ...(page.children ?? []).map(child => child.path)]))
      if (documentsPath && !taken.has(documentsPath)) {
        const page = defineModulePage(MODULE_NAME, { name: 'documents', path: documentsPath, file: resolver.resolve('./runtime/app/pages/documents.vue') })
        const layout = pages.find(candidate => candidate.name === 'account-layout')
        if (layout) (layout.children ||= []).push(page)
        else pages.push(page)
      }
      if (adminPath && !taken.has(adminPath)) {
        pages.push(defineModulePage(MODULE_NAME, { name: 'documents-admin', path: adminPath, file: resolver.resolve('./runtime/app/pages/admin.vue') }))
      }
    })

    if (hasNuxtModule('@frigear-nu/menu')) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }
  },
})
