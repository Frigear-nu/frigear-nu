import {
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  addModuleRoutes,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { operationsAccess } from './runtime/access'
import { operationsMapKinds } from './runtime/maps'
import { OPERATIONS_DASHBOARD, operationsDashboardItems } from './runtime/dashboard'
import type {
  ModuleOptions,
  OperationCreatedContext,
  OperationStatusChangedContext,
  OperationUpdatedContext,
  PublicModuleOptions,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    operations?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    operations: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** An operation was created (always in `planning`). */
    'operations:created': (ctx: OperationCreatedContext) => void | Promise<void>
    /** An operation's fields were edited (not its status: see `operations:status-changed`). `previous` is the state before. */
    'operations:updated': (ctx: OperationUpdatedContext) => void | Promise<void>
    /** An operation moved along its life cycle (`planning -> active -> wrapped_up -> archived`). */
    'operations:status-changed': (ctx: OperationStatusChangedContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/operations'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'operations' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Items on the `crew.home` dashboard.
    '@frigear-nu/dashboard': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    // An operation may name an event (`eventId`): the id is validated when events is installed.
    '@frigear-nu/events': { version: '>=0.0.1', optional: true },
    // Gives every operation a site map and a venue layout, and lets its coordinators draw on them.
    '@frigear-nu/maps': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // The `operations:manage` and `operations:read` permissions and the `operations` scope (`runtime/access.ts`).
    registerAccess(nuxt, operationsAccess, { from: MODULE_NAME })
    // The record rule of `operations:read`: public, or taking part, or staff.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The public page is on unless `pages.public` is `false`; the admin pages are opt-in and need `@frigear-nu/admin`.
    const publicPath = resolvePagePath(settings.pages?.public ?? true, '/operations/:slug')
    // Imported only when Admin is installed: it is an optional module, and a host without it must still load this one.
    let adminPath: string | undefined
    let adminOperationPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'operations'))
      adminOperationPath = resolvePagePath(settings.pages?.adminOperation, adminRoute(nuxt, 'operations', ':id'))
    }

    nuxt.options.runtimeConfig.public.operations = {
      pages: { public: publicPath, admin: adminPath, adminOperation: adminOperationPath },
      events: hasNuxtModule('@frigear-nu/events'),
    }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    // The static segment `me` wins over `:slug` in h3's radix router, whatever the registration order.
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'public/operations.get' },
      { method: 'get', path: 'me', file: 'me/operations.get' },
      { method: 'get', path: ':slug', file: 'public/operation.get' },
    ], { base: '/api/operations' })

    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/operations.get' },
      { method: 'post', path: '', file: 'admin/operations.post' },
      { method: 'get', path: ':id', file: 'admin/operation.get' },
      { method: 'patch', path: ':id', file: 'admin/operation.patch' },
      { method: 'delete', path: ':id', file: 'admin/operation.delete' },
      { method: 'post', path: ':id/status', file: 'admin/operation-status.post' },
    ], { base: '/api/admin/operations' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Answers `audience:owner:resolve` for the `operation` owner type. Always on: audience is a hard dependency.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/audience'))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useOperationLinks', from: resolver.resolve('./runtime/app/composables/useOperationLinks') },
      { name: 'useOperationActions', from: resolver.resolve('./runtime/app/composables/useOperationActions') },
      { name: 'useOperationsTranslate', from: resolver.resolve('./runtime/app/composables/useOperationsTranslate') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'operations-detail', path: publicPath, file: './runtime/app/pages/operation.vue' },
      { name: 'operations-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'operations-admin-operation', path: adminOperationPath, file: './runtime/app/pages/admin-operation.vue' },
    ])

    // Owns the `admin.operations` tab area of the admin operation page (modules add tabs with
    // `extendTabs(nuxt, 'admin.operations', ...)`) when @frigear-nu/widget is installed. Each tab component receives
    // the `operation` and may emit `refresh`.
    if (adminOperationPath && hasNuxtModule('@frigear-nu/widget')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.operations', [
        { id: 'details', component: resolver.resolve('./runtime/app/tabs/Details.vue'), order: 0, label: 'Details', labelKey: 'operations.admin.tabs.details', icon: 'i-lucide-file-text' },
      ])
    }

    // Maps: the `operations.site` and `operations.venue-layout` kinds, an `operations:created` listener that creates both
    // maps of a new operation, and the coordinators' right to edit them (`maps:edit:resolve`). Registered here, not on
    // `modules:done`: maps reads the registry once every module is done.
    if (hasNuxtModule('@frigear-nu/maps')) {
      const { extendMaps } = await import('@frigear-nu/maps/utils')
      extendMaps(nuxt, { kinds: operationsMapKinds })
      addServerPlugin(resolver.resolve('./runtime/server/plugins/maps'))
    }

    // Dashboard: this module's items on `crew.home` (`runtime/dashboard.ts`).
    if (hasNuxtModule('@frigear-nu/dashboard')) {
      const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
      extendDashboard(nuxt, OPERATIONS_DASHBOARD, operationsDashboardItems(path => resolver.resolve(path)))
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
