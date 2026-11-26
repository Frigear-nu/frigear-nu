import {
  addComponent,
  addComponentsDir,
  addImports,
  addNitroPlugin,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { guardPages, registerAccess } from '@frigear-nu/auth/utils'
import { campaignsAccess } from './runtime/access'
import { CAMPAIGNS_DEFAULT_PAGES } from './runtime/utils/links'
import type { CampaignsRuntimeConfig, ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    campaigns?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    campaigns: PublicModuleOptions
  }

  interface RuntimeConfig {
    campaigns: CampaignsRuntimeConfig
  }
}

const MODULE_NAME = '@frigear-nu/campaigns'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'campaigns' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // Signed-in users manage their own newsletters; their verified email links them to their contact.
    '@frigear-nu/users': { version: '>=0.0.1' },
    // Every message (the confirmation email and SMS) goes through notify's dispatch, on the app's drivers.
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    // Renders `campaigns-confirm` from the template this module ships.
    '@frigear-nu/email-templates': { version: '>=0.0.1', optional: true },
    // The staff pages and the sidebar and account menu items.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // The captcha of the subscribe route (`captcha` option) is checked with forms' `verifyCaptcha`.
    '@frigear-nu/forms': { version: '>=0.0.1', optional: true },
    '@frigear-nu/preferences': { version: '>=0.0.1', optional: true },
    '@frigear-nu/teams': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `campaigns:manage`, `:send`, `:send-important`, `campaigns:pii`, `campaigns:subscriptions` and the `newsletters`
    // scope (`runtime/access.ts`).
    registerAccess(nuxt, campaignsAccess, { from: MODULE_NAME })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const pages = options.settings?.pages ?? {}

    // --- Pages ------------------------------------------------------------------------------------------------------
    const confirmPath = resolvePagePath(pages.confirm ?? true, CAMPAIGNS_DEFAULT_PAGES.confirm)
    const unsubscribePath = resolvePagePath(pages.unsubscribe ?? true, CAMPAIGNS_DEFAULT_PAGES.unsubscribe)
    const accountPath = resolvePagePath(pages.account ?? true, CAMPAIGNS_DEFAULT_PAGES.account)
    let adminListsPath: string | undefined
    let adminListPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminListsPath = resolvePagePath(pages.adminLists ?? true, adminRoute(nuxt, 'campaigns', 'lists'))
      adminListPath = resolvePagePath(pages.adminList ?? true, adminRoute(nuxt, 'campaigns', 'lists', ':id'))
    }

    const captchaProvider = options.captcha || false
    if (captchaProvider && !hasNuxtModule('@frigear-nu/forms')) {
      throw new Error(`[${MODULE_NAME}] The \`captcha\` option needs @frigear-nu/forms, which checks the captcha.`)
    }

    // How `@nuxtjs/i18n` puts locales in paths, so the links in messages get the person's prefix.
    const i18nOptions = (nuxt.options as { i18n?: { strategy?: string, defaultLocale?: string, locales?: Array<string | { code: string }> } }).i18n
    const i18nLocales = (i18nOptions?.locales ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
    const i18n = i18nLocales.length ? { strategy: i18nOptions?.strategy ?? 'prefix_except_default', defaultLocale: i18nOptions?.defaultLocale ?? null, locales: i18nLocales } : null

    nuxt.options.runtimeConfig.public.campaigns = {
      pages: { confirm: confirmPath, unsubscribe: unsubscribePath, account: accountPath, adminLists: adminListsPath, adminList: adminListPath },
      captcha: captchaProvider || null,
      i18n,
    }
    // Server only. `NUXT_CAMPAIGNS_SIGNING_KEY` and `NUXT_CAMPAIGNS_CORS_ORIGINS` override at run time.
    const existing = (nuxt.options.runtimeConfig as { campaigns?: Partial<CampaignsRuntimeConfig> }).campaigns ?? {}
    nuxt.options.runtimeConfig.campaigns = {
      rateLimit: options.rateLimit ?? existing.rateLimit ?? 10,
      rateLimitWindowSeconds: options.rateLimitWindowSeconds ?? existing.rateLimitWindowSeconds ?? 600,
      confirmTtlHours: options.confirmTtlHours ?? existing.confirmTtlHours ?? 72,
      resendAfterSeconds: options.resendAfterSeconds ?? existing.resendAfterSeconds ?? 300,
      corsOrigins: options.corsOrigins ?? existing.corsOrigins ?? [],
      captcha: captchaProvider,
      signingKey: options.signingKey ?? existing.signingKey ?? '',
    } satisfies CampaignsRuntimeConfig

    // --- Database ---------------------------------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -------------------------------------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'lists/:slug', file: 'public/list.get' },
      { method: 'post', path: 'lists/:slug/subscribe', file: 'public/subscribe.post' },
      { method: 'post', path: 'confirm/:token', file: 'public/confirm.post' },
      { method: 'post', path: 'unsubscribe/:token', file: 'public/unsubscribe.post' },
      { method: 'get', path: 'me/subscriptions', file: 'me/subscriptions.get' },
      { method: 'patch', path: 'me/subscriptions', file: 'me/subscriptions.patch' },
    ], { base: '/api/campaigns' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'lists', file: 'admin/lists.get' },
      { method: 'post', path: 'lists', file: 'admin/lists.post' },
      { method: 'get', path: 'lists/:id', file: 'admin/list.get' },
      { method: 'patch', path: 'lists/:id', file: 'admin/list.patch' },
      { method: 'delete', path: 'lists/:id', file: 'admin/list.delete' },
      { method: 'get', path: 'lists/:id/subscribers', file: 'admin/list-subscribers.get' },
    ], { base: '/api/admin/campaigns' })

    // Other sites calling the subscribe route from the browser: CORS for `corsOrigins` only, without credentials.
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/campaigns-cors') })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // The captcha check of the subscribe route, with forms' `verifyCaptcha`.
    if (hasNuxtModule('@frigear-nu/forms')) addNitroPlugin(resolver.resolve('./runtime/server/plugins/forms-captcha'))

    // The `campaigns-confirm` email, as a template `@frigear-nu/email-templates` renders when installed.
    nuxt.hook('notify:email:templates', (sources) => {
      sources.push({ dir: resolver.resolve('./runtime/emails') })
    })

    // --- App runtime ------------------------------------------------------------------------------------------------
    addImports([
      { name: 'useCampaignsTranslate', from: resolver.resolve('./runtime/app/composables/useCampaignsTranslate') },
      { name: 'useCampaignsLocale', from: resolver.resolve('./runtime/app/composables/useCampaignsTranslate') },
      { name: 'useCampaignsLinks', from: resolver.resolve('./runtime/app/composables/useCampaignsLinks') },
      { name: 'useCampaignListActions', from: resolver.resolve('./runtime/app/composables/useCampaignListActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    // Global, so Nuxt Content resolves `::newsletter-signup{list="…"}` too.
    addComponent({ name: 'NewsletterSignup', filePath: resolver.resolve('./runtime/app/components/NewsletterSignup.vue'), global: true, priority: 1 })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'campaigns-confirm', path: confirmPath, file: './runtime/app/pages/confirm.vue' },
      { name: 'campaigns-unsubscribe', path: unsubscribePath, file: './runtime/app/pages/unsubscribe.vue' },
      { name: 'campaigns-account', path: accountPath, file: './runtime/app/pages/account.vue' },
      { name: 'campaigns-admin-lists', path: adminListsPath, file: './runtime/app/pages/admin-lists.vue' },
      { name: 'campaigns-admin-list', path: adminListPath, file: './runtime/app/pages/admin-list.vue' },
    ])
    // Only for signed-in people: a route rule `@frigear-nu/authorization` enforces.
    if (accountPath) guardPages(nuxt, [accountPath])

    // The Newsletters item of the admin sidebar (Manage) and of the account menu.
    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
