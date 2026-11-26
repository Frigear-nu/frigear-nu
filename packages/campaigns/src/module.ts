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
import { extendNotificationTopics } from '@frigear-nu/notify/utils'
import { campaignsAccess } from './runtime/access'
import { campaignsNotificationTopics } from './runtime/notifications'
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
const DEFAULT_DELIVER_CRON = '* * * * *'
const DEFAULT_RETENTION_CRON = '45 4 * * *'

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
    // Links in campaign messages become short links (`/l/:code/:deliveryToken`) whose clicks count per recipient.
    '@frigear-nu/short-links': { version: '>=0.0.0' },
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
    let adminCampaignsPath: string | undefined
    let adminCampaignPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminListsPath = resolvePagePath(pages.adminLists ?? true, adminRoute(nuxt, 'campaigns', 'lists'))
      adminListPath = resolvePagePath(pages.adminList ?? true, adminRoute(nuxt, 'campaigns', 'lists', ':id'))
      adminCampaignsPath = resolvePagePath(pages.adminCampaigns ?? true, adminRoute(nuxt, 'campaigns'))
      adminCampaignPath = resolvePagePath(pages.adminCampaign ?? true, adminRoute(nuxt, 'campaigns', ':id'))
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
      pages: {
        confirm: confirmPath,
        unsubscribe: unsubscribePath,
        account: accountPath,
        adminLists: adminListsPath,
        adminList: adminListPath,
        adminCampaigns: adminCampaignsPath,
        adminCampaign: adminCampaignPath,
      },
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
      batchSize: options.batchSize ?? existing.batchSize ?? 200,
      retentionDays: options.retentionDays ?? existing.retentionDays ?? 180,
    } satisfies CampaignsRuntimeConfig

    // `campaigns.message`: messages staff send to users follow each user's choice of channels for it.
    extendNotificationTopics(nuxt, campaignsNotificationTopics)

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
      { method: 'get', path: 'o/:token', file: 'public/open.get' },
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
      // The static segments `lists` and `users` win over `:id` in h3's radix router, whatever the registration order.
      { method: 'get', path: '', file: 'admin/campaigns/list.get' },
      { method: 'get', path: 'users', file: 'admin/campaigns/users.get' },
      { method: 'post', path: '', file: 'admin/campaigns/create.post' },
      { method: 'get', path: ':id', file: 'admin/campaigns/get.get' },
      { method: 'patch', path: ':id', file: 'admin/campaigns/patch.patch' },
      { method: 'delete', path: ':id', file: 'admin/campaigns/delete.delete' },
      { method: 'get', path: ':id/preview', file: 'admin/campaigns/preview.get' },
      { method: 'post', path: ':id/send', file: 'admin/campaigns/send.post' },
      { method: 'post', path: ':id/schedule', file: 'admin/campaigns/schedule.post' },
      { method: 'post', path: ':id/cancel', file: 'admin/campaigns/cancel.post' },
      { method: 'get', path: ':id/stats', file: 'admin/campaigns/stats.get' },
      { method: 'get', path: ':id/deliveries', file: 'admin/campaigns/deliveries.get' },
    ], { base: '/api/admin/campaigns' })

    // Other sites calling the subscribe route from the browser: CORS for `corsOrigins` only, without credentials.
    addServerHandler({ middleware: true, handler: resolver.resolve('./runtime/server/middleware/campaigns-cors') })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // The captcha check of the subscribe route, with forms' `verifyCaptcha`.
    if (hasNuxtModule('@frigear-nu/forms')) addNitroPlugin(resolver.resolve('./runtime/server/plugins/forms-captcha'))
    // Clicks on the short links of campaign messages, attributed to the delivery in the link.
    addNitroPlugin(resolver.resolve('./runtime/server/plugins/campaigns-clicks'))

    // --- Tasks --------------------------------------------------------------------------------------------------------
    // `campaigns:deliver` sends due campaigns in batches (every minute unless `deliverCron` says otherwise) and
    // `campaigns:retention` prunes old per-recipient rows (nightly, when `retentionDays` is set). Like the shifts and
    // inbox tasks they merge into `scheduledTasks`; `false` registers the deliver task without a schedule.
    const deliverCron = options.deliverCron === undefined ? DEFAULT_DELIVER_CRON : options.deliverCron
    const retentionDays = nuxt.options.runtimeConfig.campaigns.retentionDays
    const tasks = [
      { name: 'campaigns:deliver', handler: './runtime/server/tasks/deliver', description: 'Start due campaigns and send a batch of their messages.', cron: deliverCron || null },
      { name: 'campaigns:retention', handler: './runtime/server/tasks/retention', description: 'Delete the delivery and click rows of old campaigns, keeping their counts.', cron: retentionDays === false ? null : DEFAULT_RETENTION_CRON },
    ]
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.experimental ||= {}
      nitroConfig.experimental.tasks = true
      nitroConfig.tasks ||= {}
      nitroConfig.scheduledTasks ||= {}
      for (const task of tasks) {
        nitroConfig.tasks[task.name] = { handler: resolver.resolve(task.handler), description: task.description }
        if (!task.cron) continue
        const existing = nitroConfig.scheduledTasks[task.cron]
        nitroConfig.scheduledTasks[task.cron] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), task.name]
      }
    })
    // nitropack 2 bundles `scheduledTasks` into the worker but never writes the cron expressions to wrangler.json, so
    // Cloudflare would never trigger them: mirror our crons into `triggers.crons` (a deduped union).
    const crons = tasks.map(task => task.cron).filter((cron): cron is string => !!cron)
    if (crons.length) {
      nuxt.hook('nitro:init', (nitro) => {
        if (!nitro.options.preset.startsWith('cloudflare')) return
        const wrangler = ((nitro.options.cloudflare ||= {}).wrangler ||= {})
        wrangler.triggers = { ...wrangler.triggers, crons: [...new Set([...(wrangler.triggers?.crons ?? []), ...crons])] }
      })
    }

    // The `campaigns-confirm` and `campaigns-message` emails, as templates `@frigear-nu/email-templates` renders when installed.
    nuxt.hook('notify:email:templates', (sources) => {
      sources.push({ dir: resolver.resolve('./runtime/emails') })
    })

    // --- App runtime ------------------------------------------------------------------------------------------------
    addImports([
      { name: 'useCampaignsTranslate', from: resolver.resolve('./runtime/app/composables/useCampaignsTranslate') },
      { name: 'useCampaignsLocale', from: resolver.resolve('./runtime/app/composables/useCampaignsTranslate') },
      { name: 'useCampaignsLinks', from: resolver.resolve('./runtime/app/composables/useCampaignsLinks') },
      { name: 'useCampaignListActions', from: resolver.resolve('./runtime/app/composables/useCampaignListActions') },
      { name: 'useCampaignActions', from: resolver.resolve('./runtime/app/composables/useCampaignActions') },
      { name: 'useCampaignsAccess', from: resolver.resolve('./runtime/app/composables/useCampaignsAccess') },
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
      { name: 'campaigns-admin-campaigns', path: adminCampaignsPath, file: './runtime/app/pages/admin-campaigns.vue' },
      { name: 'campaigns-admin-campaign', path: adminCampaignPath, file: './runtime/app/pages/admin-campaign.vue' },
    ])
    // Only for signed-in people: a route rule `@frigear-nu/authorization` enforces.
    if (accountPath) guardPages(nuxt, [accountPath])

    // The Campaigns item of the admin sidebar (Manage) and the Newsletters item of the account menu.
    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
