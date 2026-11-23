import {
  addComponent,
  addComponentsDir,
  addTemplate,
  addImports,
  addServerImportsDir,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  defineVirtualRegistry,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerSearchIndex,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, guardPages, localizedRoutePatterns, registerAccess } from '@frigear-nu/auth/utils'
import { helpCenterAccess } from './runtime/access'
import { HELP_CENTER_DASHBOARD, helpCenterDashboardItems } from './runtime/dashboard'
import { extendNotificationTopics } from '@frigear-nu/notify/utils'
import { helpCenterNotificationTopics } from './runtime/notifications'
import { DEFAULT_REQUIRED_LOCALES } from './runtime/utils/publish'
import { helpCenterRoutePatterns, isPathUnder, resolveHelpCenterAreas } from './runtime/utils/paths'
import { contentRowKey, frontmatterKeys, localizedContentCollection, missingContentLocales, validateContentFile } from './runtime/utils/content'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    helpCenter?: ModuleOptions
  }

  interface RuntimeConfig {
    helpCenter: {
      content: { collection: string | null, perLocale: boolean, precedence: string }
    }
  }

  interface PublicRuntimeConfig {
    helpCenter: PublicModuleOptions
  }
}

const MODULE_NAME = '@frigear-nu/help-center'

/** What `content:file:afterParse` of Nuxt Content hands over (the part this module reads). */
type ContentAfterParse = {
  file: { id?: string, body?: string, path?: string }
  content: Record<string, unknown> & { meta?: Record<string, unknown> }
  collection: { name: string }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'helpCenter' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // The people of the progress lists and the recipients of a sent article are users, reached by email and phone.
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    // Articles are sent as links through it: email and push by `notifyUser`, SMS by `dispatchSMSNotification`.
    '@frigear-nu/notify': { version: '>=0.0.1' },
    // "Your onboarding" on the account overview.
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Items on the `crew.home` dashboard.
    '@frigear-nu/dashboard': { version: '>=0.0.0', optional: true },
    // The optional Help tab of the mobile app.
    '@frigear-nu/mobile': { version: '>=0.0.1', optional: true },
    // The built-in contact button of the FAQ cards opens a form of forms.
    '@frigear-nu/forms': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // The `help-center:*` permissions and the `help-center` scope (`runtime/access.ts`).
    registerAccess(nuxt, helpCenterAccess, { from: MODULE_NAME })
    // The record rule of `help-center:read`: the record's grants admit the user.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // --- Where things live -------------------------------------------------------------------
    // The two areas are on unless `false` (they are the product); the admin pages are opt-in and need `@frigear-nu/admin`.
    const areas = resolveHelpCenterAreas(settings.pages)
    let adminPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'help-center'))
    }
    const adminChecklistPath = adminPath ? `${adminPath.replace(/\/+$/, '')}/checklists/:id` : undefined
    // The FAQ: the accordion and cards categories with their questions, on a page of their own.
    const adminFaqPath = adminPath ? `${adminPath.replace(/\/+$/, '')}/faq` : undefined

    const withMobile = settings.mobileTab !== false && !!areas.signedIn && hasNuxtModule('@frigear-nu/mobile')
    // A page of its own for the tab: it must not sit inside either area.
    const mobilePath = withMobile
      ? ['/help-center', '/mobile/help'].find(path => ![areas.public, areas.signedIn].some(base => base && (isPathUnder(path, base) || isPathUnder(base, path))))
      : undefined

    // --- Sources -------------------------------------------------------------------------------
    const contentCollection = settings.content?.collection
    if (contentCollection && !hasNuxtModule('@nuxt/content')) {
      throw new Error('[@frigear-nu/help-center] `settings.content.collection` is set, but the `@nuxt/content` module is not installed. Install it or remove the option.')
    }
    const sources = [...new Set([...(settings.sources?.length ? settings.sources : ['database']), ...(contentCollection ? ['content'] : [])])]
    if (!contentCollection && sources.includes('content')) {
      console.warn('[@frigear-nu/help-center] `content` is listed in `settings.sources`, but `settings.content.collection` is not set: skipping the content source.')
      sources.splice(sources.indexOf('content'), 1)
    }
    const requiredLocales = settings.requiredLocales?.length ? settings.requiredLocales : [...DEFAULT_REQUIRED_LOCALES]
    const perLocale = settings.content?.perLocale === true

    // --- Menus and widgets ---------------------------------------------------------------------
    // The signed-in area goes into the account menu when it is under `/account`, and into `signedInMenu` anywhere else.
    const menuName = areas.signedIn
      ? (isPathUnder(areas.signedIn, '/account') ? (settings.accountMenu === false ? undefined : 'account') : settings.signedInMenu)
      : undefined
    const inMenu = !!menuName && addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus/signed-in'), menu: menuName })
    if (adminPath) addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus/admin'), menu: 'admin.nav' })

    // How `@nuxtjs/i18n` puts locales in paths, so links in emails get the same prefix as the pages.
    const i18nOptions = (nuxt.options as { i18n?: { strategy?: string, defaultLocale?: string, locales?: Array<string | { code: string }> } }).i18n
    const i18nLocales = (i18nOptions?.locales ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
    const i18nConfig = i18nLocales.length ? { strategy: i18nOptions?.strategy ?? 'prefix_except_default', defaultLocale: i18nOptions?.defaultLocale ?? null, locales: i18nLocales } : null

    nuxt.options.runtimeConfig.public.helpCenter = {
      pages: { public: areas.public, signedIn: areas.signedIn, admin: adminPath, adminChecklist: adminChecklistPath, adminFaq: adminFaqPath, mobile: mobilePath },
      requiredLocales,
      cta: settings.cta !== false,
      schema: settings.schema !== false,
      accountMenu: settings.accountMenu !== false,
      accountWidget: settings.accountWidget !== false,
      menu: inMenu ? menuName! : null,
      sources,
      contentCollection: contentCollection ?? null,
      faq: {
        contactComponent: settings.faq?.contactComponent ?? null,
        contactForm: settings.faq?.contactForm ?? 'contact',
        forms: hasNuxtModule('@frigear-nu/forms'),
      },
      i18n: i18nConfig,
    }
    nuxt.options.runtimeConfig.helpCenter = {
      content: { collection: contentCollection ?? null, perLocale, precedence: settings.content?.precedence ?? 'database' },
    }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })
    // `help_articles.searchText` and `searchBody`, recomputed by the `search:reindex` task.
    registerSearchIndex(nuxt, { name: 'help_articles', handler: resolver.resolve('./runtime/server/search-index') })

    // --- API routes -----------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'categories', file: 'public/categories.get' },
      { method: 'get', path: 'articles', file: 'public/articles.get' },
      { method: 'get', path: 'articles/:slug', file: 'public/article.get' },
      { method: 'get', path: 'faqs', file: 'public/faqs.get' },
      { method: 'get', path: 'me/checklists', file: 'me/checklists.get' },
      { method: 'post', path: 'me/reads', file: 'me/reads.post' },
    ], { base: '/api/help-center' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'categories', file: 'admin/categories.get' },
      { method: 'post', path: 'categories', file: 'admin/categories.post' },
      { method: 'patch', path: 'categories/:id', file: 'admin/category.patch' },
      { method: 'delete', path: 'categories/:id', file: 'admin/category.delete' },
      { method: 'get', path: 'categories/:id/articles', file: 'admin/category-articles.get' },
      { method: 'post', path: 'categories/:id/reorder', file: 'admin/category-reorder.post' },
      { method: 'get', path: 'articles', file: 'admin/articles.get' },
      { method: 'post', path: 'articles', file: 'admin/articles.post' },
      { method: 'get', path: 'articles/:id', file: 'admin/article.get' },
      // An id of another source can hold a `/` (`content:help:safety/first-aid`), and auth refuses an encoded `%2F` under /api.
      { method: 'get', path: 'source-articles/**:id', file: 'admin/article.get' },
      { method: 'patch', path: 'articles/:id', file: 'admin/article.patch' },
      { method: 'delete', path: 'articles/:id', file: 'admin/article.delete' },
      { method: 'post', path: 'articles/:id/publish', file: 'admin/article-publish.post' },
      { method: 'post', path: 'articles/:id/unpublish', file: 'admin/article-unpublish.post' },
      { method: 'get', path: 'checklists', file: 'admin/checklists.get' },
      { method: 'post', path: 'checklists', file: 'admin/checklists.post' },
      { method: 'get', path: 'checklists/:id', file: 'admin/checklist.get' },
      { method: 'patch', path: 'checklists/:id', file: 'admin/checklist.patch' },
      { method: 'delete', path: 'checklists/:id', file: 'admin/checklist.delete' },
      { method: 'get', path: 'checklists/:id/progress', file: 'admin/progress.get' },
      { method: 'post', path: 'send', file: 'admin/send.post' },
      { method: 'get', path: 'users', file: 'admin/users.get' },
    ], { base: '/api/admin/help-center' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // `@nuxt/content` is optional: the server reaches it through one virtual module, with a stand-in that throws when it
    // is not installed, so importing it never fails the build.
    defineVirtualRegistry(nuxt, {
      filename: '#help-center/optional',
      target: 'server',
      collect: () => ({ content: hasNuxtModule('@nuxt/content', nuxt) }),
      contents: ({ content }) => [
        content
          ? 'export { queryCollection } from \'@nuxt/content/server\''
          : 'export const queryCollection = () => { throw new Error(\'[@frigear-nu/help-center] @nuxt/content is not installed\') }',
      ].join('\n'),
    })
    // `@nuxtjs/mdc` is optional too (Nuxt Content brings it): the FAQ cards split the text of a `cards` article with its
    // `parseMarkdown` through one virtual module, `undefined` without it (the whole text is then the description). The
    // files come from the auto-imports `@nuxtjs/mdc` registers (`imports:extend` runs on `modules:done`, before the
    // templates are written), so the module imports them directly and not through `#imports`.
    // The list is read from the auto-import context when the template is written, once every module added its entries.
    // Imported by file, not through `#imports`, where the name may belong to another module.
    let importsContext: { getImports: () => Promise<Array<{ name: string, as?: string, from: string }>> } | undefined
    nuxt.hook('imports:context', (context) => {
      importsContext = context
    })
    const mdcTemplate = addTemplate({
      filename: 'help-center/mdc.mjs',
      write: true,
      getContents: async () => {
        const imports = await importsContext?.getImports() ?? []
        return ['parseMarkdown', 'stringifyMarkdown']
          .map((name) => {
            // The one of `@nuxtjs/mdc`: another module may register a `parseMarkdown` of its own under the same name.
            const from = imports.find(entry => entry.name === name && entry.from.includes('@nuxtjs/mdc'))?.from
            // Loaded on the first call: the parser's own imports lead back to the app's auto-imports, and a static import
            // here would make a cycle with top-level awaits that never settles.
            // One import shared by concurrent first calls (two FAQ components rendering at once).
            return from
              ? `let ${name}Module\nexport const ${name} = (...args) => (${name}Module ??= import(${JSON.stringify(from)})).then(module => module.${name}(...args))`
              : `export const ${name} = undefined`
          })
          .join('\n')
      },
    })
    nuxt.options.alias['#help-center/mdc'] = mdcTemplate.dst
    addTypeTemplate({
      filename: 'types/help-center-mdc.d.ts',
      getContents: () => `declare module '#help-center/mdc' {
  export const parseMarkdown: ((markdown: string) => Promise<unknown>) | undefined
  export const stringifyMarkdown: ((body: unknown, data: Record<string, unknown>) => Promise<string | null>) | undefined
}
`,
    }, { nuxt: true })
    addTypeTemplate({
      filename: 'types/help-center-optional.d.ts',
      getContents: () => `declare module '#help-center/optional' {
  export function queryCollection(event: unknown, collection: string): unknown
}
`,
    }, { nuxt: true, nitro: true })

    // The email of "send links", as a template @frigear-nu/email-templates renders when installed.
    nuxt.hook('notify:email:templates', templates => templates.push({ dir: resolver.resolve('./runtime/emails') }))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useHelpCenterPaths', from: resolver.resolve('./runtime/app/composables/useHelpCenterPaths') },
      { name: 'useHelpCenterSearch', from: resolver.resolve('./runtime/app/composables/useHelpCenterSearch') },
      { name: 'useHelpCenterTranslate', from: resolver.resolve('./runtime/app/composables/useHelpCenterLocale') },
      { name: 'useHelpCenterLocale', from: resolver.resolve('./runtime/app/composables/useHelpCenterLocale') },
      { name: 'useHelpCenterFallbackLocale', from: resolver.resolve('./runtime/app/composables/useHelpCenterLocale') },
      { name: 'useHelpCenterArticles', from: resolver.resolve('./runtime/app/composables/useHelpCenterData') },
      { name: 'useHelpCenterArticle', from: resolver.resolve('./runtime/app/composables/useHelpCenterData') },
      { name: 'useHelpCenterCategories', from: resolver.resolve('./runtime/app/composables/useHelpCenterData') },
      { name: 'useHelpCenterChecklists', from: resolver.resolve('./runtime/app/composables/useHelpCenterData') },
      { name: 'useHelpArticleActions', from: resolver.resolve('./runtime/app/composables/useHelpArticleActions') },
      { name: 'useHelpCategoryActions', from: resolver.resolve('./runtime/app/composables/useHelpCategoryActions') },
      { name: 'useHelpChecklistActions', from: resolver.resolve('./runtime/app/composables/useHelpChecklistActions') },
      { name: 'useHelpCenterFaqs', from: resolver.resolve('./runtime/app/composables/useHelpCenterFaqs') },
      { name: 'toFaqCardProps', from: resolver.resolve('./runtime/app/composables/useHelpCenterFaqs') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    // Global so MDC (Nuxt Content) resolves `::faq{category="..."}`, `::faq-grid{categories="..."}` and the rest in any
    // collection without a local wrapper.
    // `FaqDetails`, `FaqLink` and `FaqContact` are the blocks of a `cards` article's text (`::faq-details{...}`), `FaqCards`
    // the cards alone for a grid the parent lays out (the `#features` slot of `UPageSection`).
    for (const name of ['Faq', 'FaqCard', 'FaqCards', 'FaqGrid', 'FaqSectionList', 'FaqDetails', 'FaqLink', 'FaqContact']) {
      addComponent({ name, filePath: resolver.resolve(`./runtime/app/components/${name}.vue`), global: true, priority: 1 })
    }

    const publicRoutes = areas.public ? helpCenterRoutePatterns(areas.public) : undefined
    const signedInRoutes = areas.signedIn ? helpCenterRoutePatterns(areas.signedIn) : undefined
    addModulePages(MODULE_NAME, resolver, [
      { name: 'help-center-public', path: publicRoutes?.index, file: './runtime/app/pages/public-index.vue' },
      { name: 'help-center-public-category', path: publicRoutes?.category, file: './runtime/app/pages/public-category.vue' },
      { name: 'help-center-public-article', path: publicRoutes?.article, file: './runtime/app/pages/public-article.vue' },
      { name: 'help-center-signed-in', path: signedInRoutes?.index, file: './runtime/app/pages/signed-in-index.vue' },
      { name: 'help-center-signed-in-category', path: signedInRoutes?.category, file: './runtime/app/pages/signed-in-category.vue' },
      { name: 'help-center-signed-in-article', path: signedInRoutes?.article, file: './runtime/app/pages/signed-in-article.vue' },
      { name: 'help-center-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'help-center-admin-checklist', path: adminChecklistPath, file: './runtime/app/pages/admin-checklist.vue' },
      { name: 'help-center-admin-faq', path: adminFaqPath, file: './runtime/app/pages/admin-faq.vue' },
      { name: 'help-center-mobile', path: mobilePath, file: './runtime/app/pages/mobile.vue' },
    ])

    // The signed-in area is for signed-in people. Under `/account` the account module guards and frames it; anywhere
    // else this module does: a route rule (`guardPages`, enforced by `@frigear-nu/authorization`, also on the server,
    // under every i18n locale prefix) and, with `signedInLayout`, the host's own layout.
    const withAuthorization = hasNuxtModule('@frigear-nu/authorization')
    if (areas.signedIn) {
      const patterns = [areas.signedIn, `${areas.signedIn}/**`]
      const layout = settings.signedInLayout || undefined
      if (withAuthorization) {
        guardPages(nuxt, patterns, { layout })
      }
      else {
        if (!isPathUnder(areas.signedIn, '/account') || !hasNuxtModule('@frigear-nu/account')) {
          // Under /account the account module guards the area, but only through authorization: without both nothing does.
          console.warn(`[@frigear-nu/help-center] @frigear-nu/authorization is not installed: ${areas.signedIn} is not guarded. Install it and guard the path yourself.`)
        }
        if (layout) {
          const rules = nuxt.options.routeRules ||= {}
          for (const pattern of localizedRoutePatterns(nuxt, patterns)) rules[pattern] = { appLayout: layout, ...rules[pattern] } as (typeof rules)[string]
        }
      }
    }
    // The mobile page shows the signed-in area, so it is for signed-in people as well.
    if (mobilePath && withAuthorization) guardPages(nuxt, [mobilePath])

    if (withMobile && mobilePath) {
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, {
        id: 'help-center',
        to: mobilePath,
        label: 'Help',
        labelKey: 'helpCenter.mobile.tab',
        icon: 'i-lucide-life-buoy',
        sfSymbol: 'lifepreserver',
        sfSymbolActive: 'lifepreserver.fill',
      })
    }

    // "Your onboarding" on the account overview, next to the other modules' summaries.
    if (areas.signedIn && settings.accountWidget !== false && hasNuxtModule('@frigear-nu/widget', nuxt)) {
      const { extendWidgets } = await import('@frigear-nu/widget/utils')
      extendWidgets(nuxt, 'account.overview', { id: 'help-center-onboarding', component: resolver.resolve('./runtime/app/widgets/OnboardingSummary.vue'), order: 20 })
    }

    // The `help-center.send` topic of notify's `notifyUser`, which a send goes through (`help-center-deliver.ts`).
    extendNotificationTopics(nuxt, helpCenterNotificationTopics)

    // The same summary as an item of the `crew.home` dashboard, next to the account widget (which stays).
    if (areas.signedIn && hasNuxtModule('@frigear-nu/dashboard')) {
      const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
      extendDashboard(nuxt, HELP_CENTER_DASHBOARD, helpCenterDashboardItems(path => resolver.resolve(path)))
    }

    // --- Nuxt Content ---------------------------------------------------------------------
    // Nuxt Content articles are always public, so a file that tries to restrict itself fails the build, and so does one
    // without a category. A missing language is a warning (or `content.missingLocales: 'error'`) once everything is parsed.
    if (contentCollection) {
      const parsed = new Map<string, { key: string, locale: string | undefined }>()
      nuxt.hook('content:file:afterParse' as never, ((ctx: ContentAfterParse) => {
        const name = ctx.collection.name
        const locale = perLocale ? requiredLocales.find(code => localizedContentCollection(contentCollection, code) === name) : undefined
        // Per-locale mode reads the collections of the required locales only; another `<collection>_xx` is not ours.
        if (perLocale ? !locale : name !== contentCollection) return
        const row = ctx.content
        const keys = [...Object.keys(row), ...Object.keys(row.meta ?? {}), ...frontmatterKeys(ctx.file.body ?? '')]
        const read = (key: string) => row[key] ?? row.meta?.[key]
        const fileLocale = perLocale ? locale : (typeof read('locale') === 'string' ? read('locale') as string : undefined)
        const { errors } = validateContentFile(
          { id: ctx.file.id, keys, category: read('category'), slug: read('slug'), title: row.title, locale: perLocale ? fileLocale : read('locale') },
          { perLocale },
        )
        if (errors.length) throw new Error(`[@frigear-nu/help-center] ${errors.join('\n')}`)
        parsed.set(ctx.file.id ?? String(row.id), {
          key: contentRowKey({ stem: typeof row.stem === 'string' ? row.stem : undefined, path: typeof row.path === 'string' ? row.path : ctx.file.path }, fileLocale),
          locale: fileLocale,
        })
      }) as never)
      nuxt.hook('build:done', () => {
        const gaps = missingContentLocales([...parsed.values()], requiredLocales)
        if (!gaps.length) return
        const message = `[@frigear-nu/help-center] Nuxt Content help articles need every required language (${requiredLocales.join(', ')}):\n${gaps.map(gap => `  - ${gap.key}: missing ${gap.missing.join(', ')}`).join('\n')}`
        if (settings.content?.missingLocales === 'error') throw new Error(message)
        console.warn(message)
      })
    }
  },
})
