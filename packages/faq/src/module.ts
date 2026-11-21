import {
  addComponent,
  addComponentsDir,
  addImports,
  addServerImportsDir,
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
import { registerAccess } from '@frigear-nu/auth/utils'
import { faqAccess } from './runtime/access'
import { DEFAULT_REQUIRED_LOCALES } from './runtime/utils/publish'
import type {
  FaqGroupUpdatedContext,
  FaqItemPublishedContext,
  ModuleOptions,
  PublicModuleOptions,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    faq?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    faq: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /**
     * A group, or something in it, changed: the group was created, edited or deleted, an item was added, edited,
     * deleted, reordered, published or unpublished. Purge caches here. `group` is the state after the change (the last
     * state, for a delete).
     */
    'faq:group:updated': (ctx: FaqGroupUpdatedContext) => void | Promise<void>
    /** An item went from draft to published. Publishing a published item fires nothing. */
    'faq:item:published': (ctx: FaqItemPublishedContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/faq'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'faq' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    // The built-in contact button opens a form of forms.
    '@frigear-nu/forms': { version: '>=0.0.1', optional: true },
    // The optional FAQ tab of the mobile app.
    '@frigear-nu/mobile': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // The `faq:manage` and `faq:read` permissions and the `faq` scope (`runtime/access.ts`).
    registerAccess(nuxt, faqAccess, { from: MODULE_NAME })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The admin pages are opt-in (`pages.admin: true`, or a path) and need `@frigear-nu/admin`: they are built from its
    // shell. The group page lives below the list: `<admin>/:id`.
    const withAdmin = hasNuxtModule('@frigear-nu/admin')
    let adminPath: string | undefined
    if (withAdmin) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'faq'))
    }
    const adminGroupPath = adminPath ? `${adminPath.replace(/\/+$/, '')}/:id` : undefined

    const withMobile = settings.mobileTab === true && hasNuxtModule('@frigear-nu/mobile')
    const mobilePath = withMobile ? '/faq' : undefined

    nuxt.options.runtimeConfig.public.faq = {
      pages: { admin: adminPath, adminGroup: adminGroupPath },
      requiredLocales: settings.requiredLocales?.length ? settings.requiredLocales : [...DEFAULT_REQUIRED_LOCALES],
      schema: settings.schema !== false,
      contactComponent: settings.contactComponent ?? null,
      contactForm: settings.contactForm ?? 'contact',
      forms: hasNuxtModule('@frigear-nu/forms'),
      mobilePage: mobilePath,
    }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'groups', file: 'public/groups.get' },
      { method: 'get', path: 'groups/:slug', file: 'public/group.get' },
      { method: 'get', path: 'search', file: 'public/search.get' },
    ], { base: '/api/faq' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'groups', file: 'admin/groups.get' },
      { method: 'post', path: 'groups', file: 'admin/groups.post' },
      { method: 'get', path: 'groups/:id', file: 'admin/group.get' },
      { method: 'patch', path: 'groups/:id', file: 'admin/group.patch' },
      { method: 'delete', path: 'groups/:id', file: 'admin/group.delete' },
      { method: 'get', path: 'groups/:id/items', file: 'admin/items.get' },
      { method: 'post', path: 'groups/:id/items', file: 'admin/items.post' },
      { method: 'post', path: 'groups/:id/reorder', file: 'admin/reorder.post' },
      { method: 'patch', path: 'items/:id', file: 'admin/item.patch' },
      { method: 'delete', path: 'items/:id', file: 'admin/item.delete' },
      { method: 'post', path: 'items/:id/publish', file: 'admin/item-publish.post' },
      { method: 'post', path: 'items/:id/unpublish', file: 'admin/item-unpublish.post' },
    ], { base: '/api/admin/faq' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useFaq', from: resolver.resolve('./runtime/app/composables/useFaq') },
      { name: 'useFaqSearch', from: resolver.resolve('./runtime/app/composables/useFaqSearch') },
      { name: 'toFaqCardProps', from: resolver.resolve('./runtime/app/composables/useFaq') },
      { name: 'useFaqLocale', from: resolver.resolve('./runtime/app/composables/useFaqLocale') },
      { name: 'useFaqFallbackLocale', from: resolver.resolve('./runtime/app/composables/useFaqLocale') },
      { name: 'useFaqTranslate', from: resolver.resolve('./runtime/app/composables/useFaqLocale') },
      { name: 'useFaqLinks', from: resolver.resolve('./runtime/app/composables/useFaqLinks') },
      { name: 'useFaqGroupActions', from: resolver.resolve('./runtime/app/composables/useFaqGroupActions') },
      { name: 'useFaqItemActions', from: resolver.resolve('./runtime/app/composables/useFaqItemActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    // Global so MDC (Nuxt Content) resolves `::faq{group="..."}`, `::faq-grid{groups="..."}` and the rest in any collection
    // without a local wrapper.
    for (const name of ['Faq', 'FaqCard', 'FaqGrid', 'FaqSectionList']) {
      addComponent({ name, filePath: resolver.resolve(`./runtime/app/components/${name}.vue`), global: true, priority: 1 })
    }

    addModulePages(MODULE_NAME, resolver, [
      { name: 'faq-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'faq-admin-group', path: adminGroupPath, file: './runtime/app/pages/admin-group.vue' },
      { name: 'faq-mobile', path: mobilePath, file: './runtime/app/pages/mobile.vue' },
    ])

    if (withMobile) {
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, {
        id: 'faq',
        to: '/faq',
        label: 'FAQ',
        labelKey: 'faq.mobile.tab',
        icon: 'i-lucide-message-circle-question-mark',
        sfSymbol: 'questionmark.bubble',
        sfSymbolActive: 'questionmark.bubble.fill',
      })
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
