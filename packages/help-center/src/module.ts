import {
  addComponentsDir,
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
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { helpCenterAccess } from './runtime/access'
import { HELP_CENTER_DASHBOARD, helpCenterDashboardItems } from './runtime/dashboard'
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
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    // Articles are sent as links by email and SMS through it.
    '@frigear-nu/notify': { version: '>=0.0.1', optional: true },
    // "Your onboarding" on the account overview.
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Items on the `crew.home` dashboard.
    '@frigear-nu/dashboard': { version: '>=0.0.0', optional: true },
    // The optional Help tab of the mobile app.
    '@frigear-nu/mobile': { version: '>=0.0.1', optional: true },
    // FAQ groups shown inside categories.
    '@frigear-nu/faq': { version: '>=0.0.0', optional: true },
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
      pages: { public: areas.public, signedIn: areas.signedIn, admin: adminPath, adminChecklist: adminChecklistPath, mobile: mobilePath },
      requiredLocales,
      cta: settings.cta !== false,
      schema: settings.schema !== false,
      accountMenu: settings.accountMenu !== false,
      accountWidget: settings.accountWidget !== false,
      menu: inMenu ? menuName! : null,
      sources,
      contentCollection: contentCollection ?? null,
      faq: hasNuxtModule('@frigear-nu/faq'),
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

    // --- API routes -----------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'categories', file: 'public/categories.get' },
      { method: 'get', path: 'articles', file: 'public/articles.get' },
      { method: 'get', path: 'articles/:slug', file: 'public/article.get' },
      { method: 'get', path: 'me/checklists', file: 'me/checklists.get' },
      { method: 'post', path: 'me/reads', file: 'me/reads.post' },
    ], { base: '/api/help-center' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'categories', file: 'admin/categories.get' },
      { method: 'post', path: 'categories', file: 'admin/categories.post' },
      { method: 'patch', path: 'categories/:id', file: 'admin/category.patch' },
      { method: 'delete', path: 'categories/:id', file: 'admin/category.delete' },
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
    ], { base: '/api/admin/help-center' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // `@nuxt/content` and `@frigear-nu/notify` are optional: the server reaches them through one virtual module, with
    // stand-ins that throw when they are not installed, so importing them never fails the build.
    defineVirtualRegistry(nuxt, {
      filename: '#help-center/optional',
      target: 'server',
      collect: () => ({ content: hasNuxtModule('@nuxt/content', nuxt), notify: hasNuxtModule('@frigear-nu/notify', nuxt), push: hasNuxtModule('@frigear-nu/push', nuxt) }),
      contents: ({ content, notify, push }) => [
        content
          ? 'export { queryCollection } from \'@nuxt/content/server\''
          : 'export const queryCollection = () => { throw new Error(\'[@frigear-nu/help-center] @nuxt/content is not installed\') }',
        notify
          ? 'export { dispatchEmailNotification, dispatchSMSNotification } from \'#imports\'\nexport const notifyAvailable = true'
          : 'export const dispatchEmailNotification = () => { throw new Error(\'[@frigear-nu/help-center] @frigear-nu/notify is not installed\') }\nexport const dispatchSMSNotification = dispatchEmailNotification\nexport const notifyAvailable = false',
        // `notifyUser` of push: a send goes through it on the `help-center.send` topic when push is installed.
        push
          ? 'export { notifyUser } from \'#imports\'\nexport const pushAvailable = true'
          : 'export const notifyUser = undefined\nexport const pushAvailable = false',
      ].join('\n'),
    })
    addTypeTemplate({
      filename: 'types/help-center-optional.d.ts',
      getContents: () => `declare module '#help-center/optional' {
  export function queryCollection(event: unknown, collection: string): unknown
  export function dispatchEmailNotification(notification: {
    to: string | string[]
    subject: string
    body: string
    text?: string
    template?: { name: string, props?: Record<string, unknown>, locale?: string }
    meta?: Record<string, unknown>
  }): Promise<unknown>
  export function dispatchSMSNotification(notification: { to: string | string[], body: string }): Promise<unknown>
  export const notifyAvailable: boolean
  export const notifyUser: ((event: import('h3').H3Event | undefined, userId: number, input: {
    topic: string
    email?: { subject: string, body: string, text?: string, replyTo?: string, template?: { name: string, props?: Record<string, unknown>, locale?: string }, meta?: Record<string, unknown> }
    sms?: { body: string }
    push?: { title: string, body: string, url?: string }
  }) => Promise<{ channels: Array<'email' | 'sms' | 'push'>, skipped: Partial<Record<'email' | 'sms' | 'push', string>> }>) | undefined
  export const pushAvailable: boolean
}
`,
    }, { nuxt: true, nitro: true })

    // The email of "send links", as a template @frigear-nu/email-templates renders when installed.
    nuxt.hook('notify:email:templates' as never, ((templates: Array<{ dir: string }>) => templates.push({ dir: resolver.resolve('./runtime/emails') })) as never)

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
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

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
      { name: 'help-center-mobile', path: mobilePath, file: './runtime/app/pages/mobile.vue' },
    ])

    // The signed-in area is for signed-in people. Under `/account` the account module guards and frames it; anywhere
    // else this module does: a route rule (enforced by `@frigear-nu/authorization`, also on the server) and, with
    // `signedInLayout`, the host's own layout. With `@nuxtjs/i18n` every page also exists under `/<locale>/...`.
    const withAuthorization = hasNuxtModule('@frigear-nu/authorization')
    if (areas.signedIn) {
      const rules = nuxt.options.routeRules ||= {}
      const prefixes = ['', ...i18nLocales.map(code => `/${code}`)]
      const patterns = prefixes.flatMap(prefix => [`${prefix}${areas.signedIn}`, `${prefix}${areas.signedIn}/**`])
      if (withAuthorization) {
        for (const pattern of patterns) rules[pattern] = { authenticated: true, ...rules[pattern] } as (typeof rules)[string]
      }
      else if (!isPathUnder(areas.signedIn, '/account') || !hasNuxtModule('@frigear-nu/account')) {
        // Under /account the account module guards the area, but only through authorization: without both nothing does.
        console.warn(`[@frigear-nu/help-center] @frigear-nu/authorization is not installed: ${areas.signedIn} is not guarded. Install it and guard the path yourself.`)
      }
      if (settings.signedInLayout) {
        for (const pattern of patterns) rules[pattern] = { appLayout: settings.signedInLayout, ...rules[pattern] } as (typeof rules)[string]
      }
    }
    // The mobile page shows the signed-in area, so it is for signed-in people as well.
    if (mobilePath && withAuthorization) {
      const rules = nuxt.options.routeRules ||= {}
      for (const prefix of ['', ...i18nLocales.map(code => `/${code}`)]) {
        rules[`${prefix}${mobilePath}`] = { authenticated: true, ...rules[`${prefix}${mobilePath}`] } as (typeof rules)[string]
      }
    }

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

    // Push: the `help-center.send` topic (the send itself goes through `notifyUser`, see `help-center-send.ts`).
    if (hasNuxtModule('@frigear-nu/push')) {
      const { extendNotificationTopics } = await import('@frigear-nu/push/utils')
      extendNotificationTopics(nuxt, helpCenterNotificationTopics)
    }

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
